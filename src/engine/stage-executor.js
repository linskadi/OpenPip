const { readFileSync, writeFileSync, existsSync } = require('fs');
const { resolve } = require('path');
const { execSync } = require('child_process');
const { qualityCheck } = require('./quality/quality-check');
const { formatDuration } = require('./utils');
const { VersionManager } = require('./state/version-manager');
const { getDefaultDispatcher } = require('./dispatcher-registry');
const { StageProgressTracker } = require('./infra/visual-progress');

// Import from split modules
const { STAGE_TASKS, STAGE_OUTPUTS, CHAPTER_OUTPUT_PREFIX, PARALLEL_CONFIG } = require('./stage-constants');
const { logError, parseOutlineSections, updateConsistencyMemory, saveCheckpoint, saveVersion } = require('./stage-helpers');
const { runPostStageHooks } = require('./stage-hooks');
const { executeIterativeStage } = require('./stage-iterative');

// ============================================================
// 默认配置常量
// ============================================================

// 默认章节索引
const DEFAULT_CHAPTER_INDICES = [1, 2, 3, 4, 5];

// LLM 温度相关
const DEFAULT_TEMPERATURE = 0.7;
const RETRY_TEMP_INCREMENT = 0.1;

// 重试延迟（毫秒）
const RETRY_BASE_DELAY_MS = 2000;

// 质量检查
const DEFAULT_MIN_WORDS = 2000;

// 用户反馈
const MAX_FEEDBACK_ROUNDS = 3;

// 编辑器超时（毫秒，10分钟）
const EDITOR_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * 解析阶段任务文本：优先使用 pipeline YAML 中的 task 字段，fallback 到 STAGE_TASKS 硬编码。
 * 支持 ${topic} 模板变量替换。
 */
function resolveStageTask(stage, topic) {
  if (stage.task) {
    return stage.task.replace(/\$\{topic\}/g, topic);
  }
  return STAGE_TASKS[stage.id]?.(topic) || '';
}

async function withRetry(fn, dispatch, stage, task, project, topic, projectRoot, config, projectDir, maxRetries, label) {
  let result;
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      let currentTask = task;
      let currentConfig = config;
      if (attempt > 0 && lastError) {
        const errorMessage = lastError?.message || String(lastError);
        currentTask = `上一次执行失败，请修正以下错误后重试：\n${errorMessage}\n\n${task}`;
        currentConfig = { ...config, temperature: (config?.temperature || DEFAULT_TEMPERATURE) + RETRY_TEMP_INCREMENT * attempt };
        console.log(`  🔄 ${label}失败，重试 (${attempt}/${maxRetries})，temperature +${(RETRY_TEMP_INCREMENT * attempt).toFixed(1)}...`);
      }
      result = await dispatch(stage.agent, currentTask, project, projectRoot, currentConfig);
      break;
    } catch (err) {
      lastError = err;
      logError(projectDir, label, err, attempt);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, RETRY_BASE_DELAY_MS * (attempt + 1)));
      }
      // after last retry: return undefined result with lastError, let caller handle
    }
  }
  return { result, lastError };
}

async function executeSequentialStage(stage, project, topic, projectRoot, config, projectDir, dispatch, checkpoint, _options = {}) {
  const stageStart = Date.now();
  const chapterIndices = stage.chapters || DEFAULT_CHAPTER_INDICES;
  const outlinePath = resolve(projectDir, 'drafts/outline-v1.md');
  const sections = parseOutlineSections(outlinePath);
  const maxRetries = stage.maxRetries !== undefined ? stage.maxRetries : 1;

  if (sections.length === 0) {
    console.log('  ⚠️ 未找到 outline 章节，回退到一次性生成');
    return await executeSingleShot(stage, project, topic, projectRoot, config, projectDir, dispatch, checkpoint);
  }

  const chapters = [];
  for (const idx of chapterIndices) {
    const secIdx = idx - 1;
    if (secIdx >= sections.length) {
      console.log(`  ⚠️ 章节索引 ${idx} 超出 outline 范围 (共 ${sections.length} 节)，跳过`);
      continue;
    }
    const section = sections[secIdx];
    const chapterTask = `subtask: draft\n${resolveStageTask(stage, topic)}\n请仅撰写第 ${idx} 章「${section.title}」。\n\n章节大纲：\n${section.content.join('\n').trim()}\n\n输出此章完整正文（不含标题编号）。`;

    console.log(`  📝 撰写第 ${idx} 章: ${section.title}`);
    const { result: chapterResult, lastError: lastChapterError } = await withRetry(
      null, dispatch, stage, chapterTask, project, topic, projectRoot, config, projectDir, maxRetries,
      `${stage.id}/chapter-${idx}`
    );
    if (!chapterResult && lastChapterError) throw lastChapterError;

    const chapterOutput = `# 第 ${idx} 章 ${section.title}\n\n${chapterResult}`;
    const chapterPath = resolve(projectDir, `${CHAPTER_OUTPUT_PREFIX}${idx}.md`);
    writeFileSync(chapterPath, chapterOutput, 'utf-8');
    chapters.push({ index: idx, title: section.title, content: chapterOutput });

    updateConsistencyMemory(projectDir, idx, chapterResult, section.title);
    console.log(`  ✅ 第 ${idx} 章完成 (${chapterResult.length} 字) -> ${CHAPTER_OUTPUT_PREFIX}${idx}.md`);
  }

  const mergedDraft = chapters.map(ch => ch.content).join('\n\n');
  const outputRel = STAGE_OUTPUTS.draft;
  const outputPath = resolve(projectDir, outputRel);
  writeFileSync(outputPath, mergedDraft, 'utf-8');

  const elapsed = Date.now() - stageStart;
  console.log(`  ✅ 合并完成 (${mergedDraft.length} 字, 共 ${chapters.length} 章, 耗时 ${formatDuration(elapsed)})`);

  if (checkpoint) {
    checkpoint.stages.push({
      stage_id: stage.id,
      output_path: outputRel,
      timestamp: new Date().toISOString(),
      qualityScore: null,
      success: true,
      duration: elapsed,
      chapters: chapters.map(c => c.index),
    });
    saveCheckpoint(projectDir, checkpoint);
  }

  return { stage: stage.id, success: true, length: mergedDraft.length, duration: elapsed, chapters: chapters.length };
}

async function executeSingleShot(stage, project, topic, projectRoot, config, projectDir, dispatch, checkpoint, _options = {}) {
  const stageStart = Date.now();
  const baseTask = resolveStageTask(stage, topic);
  const fullTask = stage.task_prefix ? `${stage.task_prefix}\n${baseTask}` : baseTask;
  const maxRetries = stage.maxRetries !== undefined ? stage.maxRetries : 1;

  const { result, lastError } = await withRetry(
    null, dispatch, stage, fullTask, project, topic, projectRoot, config, projectDir, maxRetries,
    stage.id
  );
  if (result === undefined) {
    if (checkpoint) {
      const existingIdx = checkpoint.stages.findIndex(s => s.stage_id === stage.id);
      const failedRecord = {
        stage_id: stage.id,
        output_path: STAGE_OUTPUTS[stage.id] || '',
        timestamp: new Date().toISOString(),
        qualityScore: null,
        success: false,
        failed: true,
        error: lastError?.message,
        duration: Date.now() - stageStart,
        attempts: maxRetries + 1,
      };
      if (existingIdx >= 0) {
        checkpoint.stages[existingIdx] = failedRecord;
      } else {
        checkpoint.stages.push(failedRecord);
      }
      saveCheckpoint(projectDir, checkpoint);
    }
    if (stage.continueOnFailure) {
      console.log(`  ⚠️ 阶段 ${stage.id} 失败，标记为 skipped 继续...`);
      return { stage: stage.id, success: false, skipped: true, error: lastError?.message, duration: Date.now() - stageStart };
    }
    throw lastError;
  }

  const elapsed = Date.now() - stageStart;
  const outputRel = STAGE_OUTPUTS[stage.id];
  const outputPath = resolve(projectDir, outputRel);
  writeFileSync(outputPath, result, 'utf-8');
  console.log(`  ✅ 完成 (${result.length} 字, 耗时 ${formatDuration(elapsed)})`);

  if (checkpoint) {
    checkpoint.stages.push({
      stage_id: stage.id,
      output_path: outputRel,
      timestamp: new Date().toISOString(),
      qualityScore: null,
      success: true,
      duration: elapsed,
    });
    saveCheckpoint(projectDir, checkpoint);
  }

  return { stage: stage.id, success: true, length: result.length, duration: elapsed };
}

async function executeSingleStage(stage, project, topic, projectRoot, config, projectDir, dispatcher, checkpoint, options = {}) {
  const stageStart = Date.now();
  const dispatch = dispatcher || getDefaultDispatcher();
  const tracker = new StageProgressTracker();
  tracker.initStage(stage.id, 1, stage.id);
  tracker.startStage(stage.id);
  const maxRetries = stage.maxRetries !== undefined ? stage.maxRetries : 1;

  if (stage.type === 'evolve') {
    const selfEvolution = require('./features/self-evolution');
    const reviewPath = resolve(projectDir, stage.input.review);
    const reviewText = readFileSync(reviewPath, 'utf-8');
    const patterns = selfEvolution.extractPatterns(reviewText, projectRoot);
    const report = selfEvolution.generateReport(patterns, projectRoot);
    const results = selfEvolution.applyImprovements(patterns);
    selfEvolution.saveHistory(projectRoot, {
      project: project,
      failure_patterns: patterns.map(p => p.id)
    });
    const outputPath = resolve(projectDir, stage.output);
    writeFileSync(outputPath, report, 'utf-8');
    console.log(`\n🔄 自进化完成: ${patterns.length} 个模式检测到`);
    results.forEach(r => {
      if (r.status === 'applied') console.log(`  ✅ ${r.pattern_id} → ${r.target}`);
      else console.log(`  ⏭️  ${r.pattern_id}: ${r.status}`);
    });
    const elapsed = Date.now() - stageStart;
    if (checkpoint) {
      checkpoint.stages.push({
        stage_id: stage.id,
        output_path: stage.output,
        timestamp: new Date().toISOString(),
        qualityScore: null,
        success: true,
        duration: elapsed,
      });
      saveCheckpoint(projectDir, checkpoint);
    }
    return { stage: stage.id, success: true, patterns: patterns.length, duration: elapsed };
  }

  if (stage.mode === 'iterative') {
    return await executeIterativeStage(stage, project, topic, projectRoot, config, projectDir, dispatch, checkpoint);
  }

  if (stage.sequential && stage.chapters && stage.id === 'draft') {
    console.log(`  📚 逐章生成模式: ${stage.chapters.length} 章`);
    return await executeSequentialStage(stage, project, topic, projectRoot, config, projectDir, dispatch, checkpoint);
  }

  const baseTask = resolveStageTask(stage, topic);
  const fullTask = stage.task_prefix ? `${stage.task_prefix}\n${baseTask}` : baseTask;

  // 注意：result 在后续质量重试 / 编辑 / 反馈环节会被重新赋值，必须用 let
  const retryOutcome = await withRetry(
    null, dispatch, stage, fullTask, project, topic, projectRoot, config, projectDir, maxRetries,
    stage.id
  );
  let result = retryOutcome.result;
  const lastError = retryOutcome.lastError;
  if (result === undefined) {
    if (checkpoint) {
      const existingIdx = checkpoint.stages.findIndex(s => s.stage_id === stage.id);
      const failedRecord = {
        stage_id: stage.id,
        output_path: STAGE_OUTPUTS[stage.id] || stage.output || '',
        timestamp: new Date().toISOString(),
        qualityScore: null,
        success: false,
        failed: true,
        error: lastError?.message,
        duration: Date.now() - stageStart,
        attempts: maxRetries + 1,
      };
      if (existingIdx >= 0) {
        checkpoint.stages[existingIdx] = failedRecord;
      } else {
        checkpoint.stages.push(failedRecord);
      }
      saveCheckpoint(projectDir, checkpoint);
    }
    if (stage.continueOnFailure) {
      console.log(`  ⚠️ 阶段 ${stage.id} 失败，标记为 skipped 继续...`);
      return { stage: stage.id, success: false, skipped: true, error: lastError?.message, duration: Date.now() - stageStart };
    }
    throw lastError;
  }

  const elapsed = Date.now() - stageStart;
  const outputRel = STAGE_OUTPUTS[stage.id] || stage.output || `${stage.id}.md`;
  const outputPath = resolve(projectDir, outputRel);
  writeFileSync(outputPath, result, 'utf-8');
  console.log(`  ✅ 完成 (${result.length} 字, 耗时 ${formatDuration(elapsed)})`);

  // Quality check
  let qualityScore = null;
  if (stage.qualityCheck !== false) {
    try {
      const minWords = stage.minWords || DEFAULT_MIN_WORDS;
      const qc = qualityCheck(result, { minWords });
      qualityScore = qc.compositeScore;
      if (!qc.pass) {
        console.log(`  ⚠️ 质量检查未通过 (score=${qualityScore}):`);
        qc.metrics.filter(m => !m.pass).forEach(m => console.log(`    - ${m.name}: ${m.score}/100`));
        if ((stage.qualityRetries || 0) > 0) {
          for (let qr = 0; qr < (stage.qualityRetries || 0); qr++) {
            console.log(`  🔄 质量重试 (${qr + 1}/${stage.qualityRetries})...`);
            try {
              const retryConfig = { ...config, temperature: (config?.temperature || DEFAULT_TEMPERATURE) + RETRY_TEMP_INCREMENT * (qr + 1) };
              result = await dispatch(stage.agent, fullTask, project, projectRoot, retryConfig);
              const retryQc = qualityCheck(result, { minWords });
              qualityScore = retryQc.compositeScore;
              if (retryQc.pass) {
                writeFileSync(outputPath, result, 'utf-8');
                console.log(`  ✅ 质量重试通过 (score=${qualityScore})`);
                break;
              }
            } catch (_) {
              // 质量重试失败时忽略，继续下一轮或退出循环
            }
          }
        }
      } else {
        console.log(`  ✅ 质量检查通过 (score=${qualityScore})`);
      }
    } catch (qcErr) {
      console.log(`  ⚠️ 质量检查异常: ${qcErr.message}`);
    }
  }

  // User approval gate
  if (stage.approval !== false) {
    try {
      const { approvalGate, UserAbortError: Uae } = require('./user-approval/gate');
      const { buildRevisionPrompt } = require('./user-approval/feedback');
      for (let feedbackRound = 0; feedbackRound < MAX_FEEDBACK_ROUNDS; feedbackRound++) {
        const decision = await approvalGate(stage, result, projectDir, {
          qualityScore,
          elapsed,
          confirm: null,
          ipcConfirm: options.ipcConfirm,
        });
        if (decision.action === 'approve') break;
        if (decision.action === 'stop') throw new Uae('用户中止流水线');
        if (decision.action === 'edit') {
          const editor = process.env.EDITOR || process.env.VISUAL || 'notepad';
          console.log(`  📝 打开编辑器: ${editor}`);
          try {
            execSync(`${editor} "${outputPath}"`, { stdio: 'inherit', timeout: EDITOR_TIMEOUT_MS });
          } catch (e) {
            console.log(`  ⚠️ 编辑器启动失败: ${e.message}`);
          }
          result = readFileSync(outputPath, 'utf-8');
          writeFileSync(outputPath, result, 'utf-8');
          console.log(`  ✅ 手动编辑完成 (${result.length} 字)`);
          break;
        }
        if (decision.action === 'feedback' && decision.feedback) {
          const revisionPrompt = buildRevisionPrompt(fullTask, decision.feedback, stage, result);
          console.log(`  🔄 根据反馈修改 (第 ${feedbackRound + 1} 轮)...`);
          try {
            result = await dispatch(stage.agent, revisionPrompt, project, projectRoot, config);
            writeFileSync(outputPath, result, 'utf-8');
            console.log(`  ✅ 修改完成 (${result.length} 字)`);
          } catch (err) {
            console.log(`  ⚠️ 修改失败: ${err.message}`);
            break;
          }
        }
      }
    } catch (gateErr) {
      if (gateErr.name === 'UserAbortError') throw gateErr;
      console.log(`  ⚠️ 审批门禁异常: ${gateErr.message}`);
    }
  }

  // Version snapshot
  try {
    const vm = new VersionManager(projectRoot);
    const snapshotFile = resolve(projectDir, outputPath);
    if (existsSync(snapshotFile)) {
      vm.autoSnapshot(checkpoint?.pipeline || 'pipeline', stage.id, [{ path: snapshotFile }]);
      console.log(`  📦 版本快照: ${stage.id} -> ${vm.getCurrentVersion()}`);
    }
  } catch (err) {
    saveVersion(projectDir, project, stage.id, 0);
    console.log(`  ⚠️ VersionManager 回退到内联 saveVersion: ${err.message}`);
  }

  // Post-stage hooks
  const hooksLog = await runPostStageHooks(stage, projectDir, projectRoot, checkpoint?.pipeline, config);

  // Checkpoint save
  if (checkpoint) {
    checkpoint.stages.push({
      stage_id: stage.id,
      output_path: outputPath,
      timestamp: new Date().toISOString(),
      qualityScore: qualityScore,
      success: true,
      duration: elapsed,
      hooks: hooksLog,
    });
    saveCheckpoint(projectDir, checkpoint);
  }

  tracker.completeStage(stage.id);
  return { stage: stage.id, success: true, length: result.length, duration: elapsed, qualityScore, hooks: hooksLog };
}

async function executeParallelGroup(group, project, topic, projectRoot, config, projectDir, dispatcher, checkpoint, options = {}) {
  const concurrency = Math.min(group.length, PARALLEL_CONFIG.maxConcurrent);
  const results = [];

  for (let i = 0; i < group.length; i += concurrency) {
    const batch = group.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(stage => executeSingleStage(stage, project, topic, projectRoot, config, projectDir, dispatcher, checkpoint, options))
    );
    for (const r of batchResults) {
      if (r.status === 'fulfilled') results.push(r.value);
      else results.push({ success: false, error: r.reason?.message });
    }
  }
  return results;
}

module.exports = {
  executeSingleStage,
  executeParallelGroup,
  executeSequentialStage,
  executeSingleShot,
};

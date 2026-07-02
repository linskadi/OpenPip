const { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } = require('fs');
const { resolve } = require('path');

const { getDefaultDispatcher } = require('./dispatcher-registry');
const { reviewLoop } = require('./review/review-loop');
const { formatDuration, loadYaml, loadJsonFile } = require('./utils');
const StageExecutor = require('./stage-executor');
const { FeedbackParser } = require('./feedback-parser');
const { KnowledgeCandidatePool } = require('./knowledge/knowledge-growth');
const { ExecutionTracer } = require('./infra/debug-observability');
const { loadBlackboard, initBlackboard, BlackboardCache } = require('./state/shared-state');
const { globalTraceContext } = require('./infra/tracing');
const { defaultLogger } = require('./infra/logger');
const { PARALLEL_CONFIG, STAGE_OUTPUTS } = require('./stage-constants');
const { saveCheckpoint, getCheckpointPath, parseOutlineSections } = require('./stage-helpers');
const { DependencyResolver } = require('./dependency-resolver');

const {
  executeSingleStage, executeParallelGroup,
} = StageExecutor;

// ============================================================
// 流水线配置常量
// ============================================================

// Drift Replan 草稿截断长度
const REPLAN_DRAFT_TRUNCATE = 5000;

// 章节重写草稿截断长度
const REWRITE_DRAFT_TRUNCATE = 3000;

// Accept 决策检测窗口（字符数）
const ACCEPT_DETECT_WINDOW = 500;

function getDependencies(stage, allStages) {
  const deps = [];
  const input = stage.input;
  if (!input) return deps;

  const files = typeof input === 'string' ? [input] : Object.values(input);
  for (const file of files) {
    if (typeof file !== 'string' || !file.endsWith('.md')) continue;
    const producer = allStages.find(s => s.output === file);
    if (producer) deps.push(producer.id);
  }
  return deps;
}

function getExecutionGroups(stages) {
  const groups = [];
  const completed = new Set();

  while (completed.size < stages.length) {
    const group = [];
    for (const stage of stages) {
      if (completed.has(stage.id)) continue;
      const deps = getDependencies(stage, stages);
      if (deps.every(d => completed.has(d))) {
        group.push(stage);
      }
    }
    if (group.length === 0) break;
    groups.push(group);
    for (const s of group) completed.add(s.id);
  }

  return groups;
}

// ============================================================
// 动态调度规则（从 pipeline YAML 的 branchRules 读取）
// ============================================================

function evaluateCondition(cond, text, classification) {
  if (!cond) return false;
  if (cond.type === 'keyword') {
    const keywords = cond.keywords || [];
    const matches = keywords.filter(k => text.includes(k));
    return cond.operator === 'and' ? matches.length === keywords.length : matches.length > 0;
  }
  if (cond.type === 'classification') {
    return classification && classification.firstClass === cond.value;
  }
  return false;
}

function evaluateBranchRules(pipeline, researchResult, classification) {
  const rules = pipeline.branchRules || [];
  let result = [...pipeline.stages];
  for (const rule of rules) {
    if (evaluateCondition(rule.condition, researchResult, classification)) {
      if (rule.action === 'skip' && rule.skip) {
        result = result.filter(s => !rule.skip.includes(s.id));
        console.log(`  🔀 动态调度: 跳过阶段 [${rule.skip.join(', ')}]`);
      }
      if (rule.action === 'insert' && rule.insertAfter && rule.stage) {
        const idx = result.findIndex(s => s.id === rule.insertAfter);
        if (idx >= 0) {
          const stageDef = (pipeline.dynamicStages || {})[rule.stage] || {};
          result.splice(idx + 1, 0, { id: rule.stage, ...stageDef });
          console.log(`  🔀 动态调度: 在 ${rule.insertAfter} 后插入 ${rule.stage} (${stageDef.agent || 'writer'})`);
        }
      }
    }
  }
  return result;
}

// 向后兼容：硬编码默认规则（当 pipeline 未配置 branchRules 时使用）
const DEFAULT_BRANCH_RULES = [
  {
    name: 'experiment',
    condition: { type: 'keyword', keywords: ['实验', '数据集', '对比', '比较'], operator: 'and' },
    action: 'insert', insertAfter: 'skeleton', stage: 'experiment-design',
  },
  {
    name: 'review',
    condition: { type: 'keyword', keywords: ['综述', 'survey', 'literature review'], operator: 'or' },
    action: 'skip', skip: ['draft'],
  },
  {
    name: 'competition',
    condition: { type: 'keyword', keywords: ['数学建模', '竞赛', 'MCM', 'ICM', '优化', '约束'], operator: 'or' },
    action: 'insert', insertAfter: 'skeleton', stage: 'code',
  },
  {
    name: 'theory',
    condition: { type: 'keyword', keywords: ['理论', '定理', 'proof', '推导', '公式', '方程'], operator: 'and' },
    action: 'insert', insertAfter: 'research', stage: 'theory-analysis',
  },
  {
    name: 'figure_dense',
    condition: { type: 'keyword', keywords: ['可视化', 'visualization', '图像', 'image', '分布图', '热力图', '对比图', '架构图'], operator: 'or' },
    action: 'insert', insertAfter: 'draft', stage: 'figure',
  },
];

const DEFAULT_DYNAMIC_STAGES = {
  'experiment-design': { agent: 'writer', output: 'drafts/experiment-design.md', task_prefix: 'subtask: draft' },
  'code': { agent: 'coder', output: 'drafts/notebook.ipynb', task_prefix: '' },
  'theory-analysis': { agent: 'researcher', output: 'research/theory-analysis.md', task_prefix: 'subtask: theory-analysis' },
  'figure': { agent: 'formatter', output: 'figures/', task_prefix: 'subtask: figure' },
};

const { getResolver } = require('./resource-resolver');

function loadPipeline(name, projectRoot) {
  const resolver = getResolver(projectRoot);
  const pipelinePath = resolver.resolvePipeline(name);
  if (!pipelinePath) throw new Error(`Pipeline '${name}' not found in any layer`);
  const data = loadYaml(pipelinePath, null);
  // 处理 pipeline 别名：ref 字段指向另一个 pipeline
  if (data && data.ref) {
    return loadPipeline(data.ref, projectRoot);
  }
  return data;
}

// TODO(v0.2.0): 增加项目配置校验，确保必填字段完整且格式正确
// 现状：initProject 仅创建目录，不校验配置；v0.2.0 计划增加 schema 校验
function initProject(projectName, projectRoot) {
  const projectDir = resolve(projectRoot, 'papers', projectName);
  // TODO(v0.2.0): 目录结构从配置读取，支持自定义项目目录布局
  // 现状：固定创建 research/drafts/output/versions 四个目录；v0.2.0 计划从 pipeline 配置读取
  for (const dir of ['research', 'drafts', 'output', 'versions']) {
    const d = resolve(projectDir, dir);
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }

  // 创建项目级 .openpip/ 子目录结构（用于用户定制）
  const projectOmDir = resolve(projectDir, '.openpip');
  for (const sub of ['materials', 'materials/references', 'materials/data', 'materials/notes',
    'materials/images', 'styles', 'knowledge', 'custom-roles']) {
    const subPath = resolve(projectOmDir, sub);
    if (!existsSync(subPath)) mkdirSync(subPath, { recursive: true });
  }

  // 生成 project.yaml 模板
  const projectYamlPath = resolve(projectOmDir, 'project.yaml');
  if (!existsSync(projectYamlPath)) {
    const projectYaml = [
      '# OpenPip 项目配置文件',
      '# 修改此文件以自定义本项目的行为',
      '# 留空的字段将使用全局默认值',
      '',
      'title: ""           # 论文标题',
      'classification: ""  # 分类（如: 科创发明/技术设计类）',
      '',
      '# 自定义规则示例（取消注释以启用）:',
      '# custom_rules:',
      '#   writer:',
      '#     constraints:',
      '#       - "每段不超过150字"',
      '',
      '# 风格参考（指向 styles/ 目录下的文件）:',
      '# style_reference: ""  # 如: styles/reference-paper.pdf',
    ].join('\n');
    writeFileSync(projectYamlPath, projectYaml);
  }
  const memPath = resolve(projectDir, 'drafts', 'consistency-memory.md');
  if (!existsSync(memPath)) {
    writeFileSync(memPath, `# 全文一致性记忆文档

> 由 OpenPip 自动维护。

## 核心论点
（待填写）

## 术语表
| 中文术语 | 英文术语 | 首次定义位置 | 定义 |
|---------|---------|------------|------|

## 变量表
| 变量符号 | 含义 | 单位 | 首次出现公式 |
|---------|------|------|------------|

## 引用编号分配
| 编号 | 文献简述 | 使用章节 |
|------|---------|---------|

## 图表编号计划
| 编号 | 类型 | 标题 | 所在章节 |
|------|------|------|---------|
`, 'utf-8');
  }
  return projectDir;
}

// STAGE_OUTPUTS 已从 stage-constants 导入





// ============================================================
// Checkpoint 系统
// ============================================================

function loadCheckpoint(projectDir) {
  const cpPath = getCheckpointPath(projectDir);
  const cp = loadJsonFile(cpPath, null);
  if (!cp) return null;
  if (cp.stages && Array.isArray(cp.stages)) {
    for (const s of cp.stages) {
      if (s.quality_score !== undefined && s.qualityScore === undefined) {
        s.qualityScore = s.quality_score;
        delete s.quality_score;
      }
    }
  }
  return cp;
}

function clearCheckpoint(projectDir) {
  const cpPath = getCheckpointPath(projectDir);
  if (existsSync(cpPath)) {
    unlinkSync(cpPath);
  }
}

function getCompletedStages(checkpoint) {
  if (!checkpoint || !checkpoint.stages) return [];
  return checkpoint.stages.filter(s => s.success).map(s => s.stage_id);
}

function getFailedStages(checkpoint) {
  if (!checkpoint || !checkpoint.stages) return [];
  return checkpoint.stages.filter(s => s.failed).map(s => s.stage_id);
}





// ============================================================
// 主流水线
// ============================================================

async function runPipeline(pipelineName, project, topic, projectRoot, config, options = {}) {
  const tracingEnabled = config?.features?.tracing !== false;
  globalTraceContext.setEnabled(tracingEnabled);
  defaultLogger.setEnabled(tracingEnabled);

  const tracer = new ExecutionTracer(projectRoot);
  let traceId = null;
  if (tracingEnabled) {
    traceId = tracer.startTrace(`pipeline:${pipelineName}`, { project, topic });
  }
  const confirm = options.confirm;
  const dispatcher = options.dispatcher || getDefaultDispatcher();
  const pipeline = loadPipeline(pipelineName, projectRoot);

  // Check pipeline dependencies
  const depResolver = new DependencyResolver(projectRoot);
  const depCheck = depResolver.check(pipeline);
  if (!depCheck.satisfied) {
    console.log('  ⚠️ 管线依赖缺失:');
    for (const m of depCheck.missing) {
      console.log(`    - ${m.type}: ${m.name}`);
    }
    console.log('  继续执行（缺失依赖可能影响功能）...\n');
  }

  console.log(`\n📄 OpenPip 流水线: ${pipeline.name}`);
  console.log(`📁 项目: papers/${project}`);
  console.log(`📝 选题: ${topic}`);
  if (tracingEnabled && traceId) {
    console.log(`🔍 Trace ID: ${traceId}`);
  }
  console.log('');
  initProject(project, projectRoot);

  const projectDir = resolve(projectRoot, 'papers', project);
  
  if (tracingEnabled && traceId) {
    try {
      initBlackboard(projectDir);
      const bbCache = new BlackboardCache(projectDir);
      bbCache.update(bb => {
        bb.meta = bb.meta || {};
        bb.meta.trace_id = traceId;
      });
      bbCache.flush();
    } catch (e) {
      defaultLogger.warn('Failed to save trace_id to blackboard', { error: e.message });
    }
    defaultLogger.info('Pipeline started', {
      pipeline: pipelineName,
      project,
      topic,
      trace_id: traceId,
    });
  }

  const driftAutoReplanEnabled = config?.features?.drift_auto_replan === true;
  let driftReplanInProgress = false;

  if (driftAutoReplanEnabled) {
    const { EventBus, EVENT_TYPES } = require('./infra/event-bus');
    const bus = EventBus.getInstance();
    bus.on(EVENT_TYPES.OUTLINE_DRIFT, async (data) => {
      if (driftReplanInProgress) return;
      driftReplanInProgress = true;

      const driftLogPath = resolve(projectDir, 'output/drift-replan.log');
      const logTimestamp = new Date().toISOString();

      try {
        console.log(`\n🔄 [Drift Replan] 检测到大纲漂移 (driftScore=${data.driftScore.toFixed(3)})，启动自动 replan...`);

        const outlineV1Path = resolve(projectDir, 'drafts/outline-v1.md');
        const draftPath = resolve(projectDir, 'drafts/draft-v1.md');
        const outlineV2Path = resolve(projectDir, 'drafts/outline-v2.md');

        if (!existsSync(outlineV1Path) || !existsSync(draftPath)) {
          console.log('  ⚠️ [Drift Replan] 缺少必要文件，跳过 replan');
          writeFileSync(driftLogPath, `[${logTimestamp}] REPLAN skipped: missing files\n`, { flag: 'a', encoding: 'utf-8' });
          driftReplanInProgress = false;
          return;
        }

        const originalOutline = readFileSync(outlineV1Path, 'utf-8');
        const currentDraft = readFileSync(draftPath, 'utf-8');

        const replanTask = [
          'subtask: skeleton',
          '基于现有论文草稿和原始大纲，重新设计优化后的论文大纲。',
          '',
          '## 原始大纲',
          originalOutline,
          '',
          '## 当前论文草稿',
          currentDraft.substring(0, REPLAN_DRAFT_TRUNCATE) + (currentDraft.length > REPLAN_DRAFT_TRUNCATE ? '\n...(已截断)' : ''),
          '',
          '## 漂移详情',
          `漂移分数: ${data.driftScore.toFixed(3)} (阈值: ${data.driftThreshold})`,
          `缺失章节: ${data.details?.missingSections?.join(', ') || '无'}`,
          `多余章节: ${data.details?.extraSections?.join(', ') || '无'}`,
          `偏离章节: ${data.details?.deviatedSections?.join(', ') || '无'}`,
          '',
          '请输出优化后的完整大纲（v2），保持 ## 章节结构，确保论文结构合理、逻辑连贯。',
        ].join('\n');

        console.log('  📝 [Drift Replan] 调用 planner 重新生成大纲...');
        const newOutline = await dispatcher('planner', replanTask, project, projectRoot, config);
        writeFileSync(outlineV2Path, newOutline, 'utf-8');
        console.log('  ✅ [Drift Replan] 新大纲已保存: drafts/outline-v2.md');

        const deviatedSections = data.details?.deviatedSections || [];
        if (deviatedSections.length > 0) {
          console.log(`  ✍️ [Drift Replan] 重写受影响章节 (${deviatedSections.length} 章)...`);

          const v2Sections = parseOutlineSections(outlineV2Path);

          let updatedDraft = currentDraft;
          let rewrittenCount = 0;

          for (const deviatedTitle of deviatedSections) {
            const section = v2Sections.find(s => s.title === deviatedTitle);
            if (section) {
              const rewriteTask = [
                'subtask: draft',
                `请重写论文的「${deviatedTitle}」章节，确保与新大纲一致。`,
                '',
                '## 新大纲章节',
                `### ${section.title}`,
                section.content.join('\n'),
                '',
                '## 当前草稿（供参考）',
                currentDraft.substring(0, REWRITE_DRAFT_TRUNCATE),
                '',
                '请输出该章节的完整正文（不含标题编号）。',
              ].join('\n');

              try {
                const rewrittenSection = await dispatcher('writer', rewriteTask, project, projectRoot, config);
                const sectionHeading = new RegExp(`^##\\s+.*${deviatedTitle}.*$`, 'm');
                if (sectionHeading.test(updatedDraft)) {
                  updatedDraft = updatedDraft.replace(
                    new RegExp(`(##\\s+.*${deviatedTitle}.*\\n)[\\s\\S]*?(?=\\n##\\s|$)`, 'm'),
                    `$1\n${rewrittenSection}\n\n`
                  );
                }
                rewrittenCount++;
                console.log(`    ✅ 已重写: ${deviatedTitle}`);
              } catch (err) {
                console.log(`    ⚠️ 重写失败: ${deviatedTitle} - ${err.message}`);
              }
            }
          }

          if (rewrittenCount > 0) {
            writeFileSync(draftPath, updatedDraft, 'utf-8');
            console.log(`  ✅ [Drift Replan] 已重写 ${rewrittenCount} 个章节`);
          }
        }

        const replanResult = {
          success: true,
          newOutlinePath: 'drafts/outline-v2.md',
          rewrittenSections: deviatedSections.length,
          driftScore: data.driftScore,
        };

        writeFileSync(driftLogPath, `[${logTimestamp}] REPLAN success: driftScore=${data.driftScore.toFixed(3)}, rewritten=${deviatedSections.length}\n`, { flag: 'a', encoding: 'utf-8' });
        console.log(`  🎉 [Drift Replan] 完成！driftScore=${data.driftScore.toFixed(3)}\n`);

        driftReplanInProgress = false;
        return replanResult;
      } catch (err) {
        console.error(`  ❌ [Drift Replan] 失败: ${err.message}`);
        writeFileSync(driftLogPath, `[${logTimestamp}] REPLAN failed: ${err.message}\n`, { flag: 'a', encoding: 'utf-8' });
        driftReplanInProgress = false;
      }
    });
    console.log('  📡 Drift 自动 replan 已启用');
  }

  // 初始化 checkpoint
  let checkpoint = { pipeline: pipelineName, project, stages: [] };

  // Resume 支持：从已有 checkpoint 恢复
  if (options.resume) {
    const existing = loadCheckpoint(projectDir);
    if (existing) {
      checkpoint = existing;
      const completed = getCompletedStages(checkpoint);
      const failed = getFailedStages(checkpoint);
      console.log(`  🔄 从 checkpoint 恢复，已完成: ${completed.join(', ') || '无'}`);
      if (failed.length > 0) {
        console.log(`  ❌ 失败阶段: ${failed.join(', ')}（将重新执行）`);
        for (const failedId of failed) {
          const idx = checkpoint.stages.findIndex(s => s.stage_id === failedId);
          if (idx >= 0) {
            checkpoint.stages.splice(idx, 1);
          }
        }
        saveCheckpoint(projectDir, checkpoint);
      }
    } else {
      console.log('  ⚠️ 未找到 checkpoint，从头开始');
    }
  }

  let stages = [...pipeline.stages];

  // fromStage 支持：从指定阶段开始，跳过之前的阶段
  if (options.fromStage) {
    const fromIdx = stages.findIndex(s => s.id === options.fromStage);
    if (fromIdx >= 0) {
      // 将 fromStage 之前的所有阶段标记为已完成
      const skipStages = stages.slice(0, fromIdx).map(s => s.id);
      console.log(`  🔄 从阶段 "${options.fromStage}" 开始，跳过: ${skipStages.join(', ') || '无'}`);
      for (const skipId of skipStages) {
        if (!checkpoint.stages.some(s => s.stage_id === skipId)) {
          checkpoint.stages.push({
            stage_id: skipId,
            output_path: STAGE_OUTPUTS[skipId] || '',
            timestamp: new Date().toISOString(),
            qualityScore: null,
            success: true,
            skipped: true,
          });
        }
      }
      saveCheckpoint(projectDir, checkpoint);
    } else {
      console.log(`  ⚠️ 未找到阶段 "${options.fromStage}"，从头开始`);
    }
  }

  const researchResult = (() => {
    try {
      return readFileSync(resolve(projectDir, 'research/research-brief.md'), 'utf-8');
    } catch {
      // research-brief.md 不存在，返回空字符串
      return '';
    }
  })();

  const classification = (() => {
    try {
      const bb = loadBlackboard(projectDir);
      return bb.classification || null;
    } catch { return null; }
  })();

  // 使用 pipeline YAML 中的 branchRules，如果没有则 fallback 到默认规则
  if (pipeline.branchRules && pipeline.branchRules.length > 0) {
    // 合并 pipeline 的 dynamicStages 和默认 dynamicStages
    const mergedDynamicStages = { ...DEFAULT_DYNAMIC_STAGES, ...(pipeline.dynamicStages || {}) };
    const pipelineWithDefaults = { ...pipeline, dynamicStages: mergedDynamicStages };
    stages = evaluateBranchRules(pipelineWithDefaults, researchResult, classification);
  } else {
    // 向后兼容：使用硬编码默认规则
    const fallbackPipeline = {
      stages,
      branchRules: DEFAULT_BRANCH_RULES,
      dynamicStages: DEFAULT_DYNAMIC_STAGES,
    };
    stages = evaluateBranchRules(fallbackPipeline, researchResult, classification);
  }

  const progressPath = resolve(projectDir, 'pipeline-progress.json');
  const progress = loadJsonFile(progressPath, { completed: [], current: null });
  if (progress.completed && progress.completed.length > 0) {
    console.log(`  📋 已完成阶段: ${progress.completed.join(', ')}`);
  }

  // 合并 checkpoint 已完成的阶段到 progress
  const cpCompleted = getCompletedStages(checkpoint);
  for (const cpStage of cpCompleted) {
    if (!progress.completed.includes(cpStage)) {
      progress.completed.push(cpStage);
    }
  }

  const totalStages = stages.length;
  const stageTimings = [];
  const groups = getExecutionGroups(stages);

  console.log(`  🔄 执行模式: 并行 (${groups.length} 组, 最大并发 ${PARALLEL_CONFIG.maxConcurrent})\n`);

  let completedCount = progress.completed.length;

  for (const group of groups) {
    const pending = group.filter(s => !progress.completed.includes(s.id));
    if (pending.length === 0) continue;

    if (pending.length === 1) {
      const stage = pending[0];
      const pct = Math.round((completedCount / totalStages) * 100);
      console.log(`\n--- 阶段: ${stage.id} (${stage.agent}) [${pct}%] ---`);

      // 条件阶段：检查上一阶段产物决定是否跳过（如 review=Accept 则跳过 revise）
      if (stage.condition) {
        const reviewPath = resolve(projectDir, 'output/review-report.md');
        if (existsSync(reviewPath)) {
          const reviewContent = readFileSync(reviewPath, 'utf-8');
          if (/决策[:：]\s*Accept/i.test(reviewContent) || /\bAccept\b/i.test(reviewContent.slice(0, ACCEPT_DETECT_WINDOW))) {
            console.log(`  ⏭️  阶段「${stage.id}」条件未触发（review=Accept），跳过`);
            progress.completed.push(stage.id);
            completedCount++;
            writeFileSync(progressPath, JSON.stringify(progress, null, 2), 'utf-8');
            continue;
          }
        }
      }

      if (stage.confirm && typeof confirm === 'function') {
        console.log(`\n  ⚠️  阶段「${stage.id}」需要确认后才能继续。`);
        const confirmed = await confirm(`  确认执行「${stage.id}」阶段? (y/N): `);
        if (!confirmed) {
          console.log('  ⏹️  用户取消，流水线中止。');
          progress.current = null;
          writeFileSync(progressPath, JSON.stringify(progress, null, 2), 'utf-8');
          return;
        }
        console.log('  ✅ 用户已确认，开始执行。\n');
      }

      progress.current = stage.id;
      writeFileSync(progressPath, JSON.stringify(progress, null, 2), 'utf-8');
      tracer.step(`stage:${stage.id}:start`, { agent: stage.agent });

      try {
        const result = await executeSingleStage(stage, project, topic, projectRoot, config, projectDir, dispatcher, checkpoint, { ipcConfirm: confirm });
        stageTimings.push({ stage: stage.id, duration: result.duration, error: result.error });
        progress.completed.push(stage.id);
        progress.current = null;
        completedCount++;
        writeFileSync(progressPath, JSON.stringify(progress, null, 2), 'utf-8');
        if (result.skipped) {
          console.log(`  ⏭️  阶段「${stage.id}」因 continueOnFailure 标记为 skipped 继续`);
          tracer.step(`stage:${stage.id}:skipped`, { error: result.error });
        } else {
          tracer.step(`stage:${stage.id}:done`, { duration: result.duration, success: true });
        }
      } catch (err) {
        stageTimings.push({ stage: stage.id, duration: 0, error: err.message });
        console.error(`  ❌ 失败: ${err.message}`);
        console.log('  💡 可使用 --resume 选项从 checkpoint 恢复');
        progress.current = null;
        writeFileSync(progressPath, JSON.stringify(progress, null, 2), 'utf-8');
        tracer.step(`stage:${stage.id}:failed`, { error: err.message });
        break;
      }
    } else {
      const pct = Math.round((completedCount / totalStages) * 100);
      console.log(`\n--- 并行阶段: [${pending.map(s => s.id).join(', ')}] [${pct}%] ---`);

      const hasConfirm = pending.some(s => s.confirm && typeof confirm === 'function');
      if (hasConfirm) {
        for (const stage of pending) {
          if (stage.confirm && typeof confirm === 'function') {
            console.log(`\n  ⚠️  阶段「${stage.id}」需要确认后才能继续。`);
            const confirmed = await confirm(`  确认执行「${stage.id}」阶段? (y/N): `);
            if (!confirmed) {
              console.log('  ⏹️  用户取消，流水线中止。');
              progress.current = null;
              writeFileSync(progressPath, JSON.stringify(progress, null, 2), 'utf-8');
              return;
            }
            console.log('  ✅ 用户已确认，开始执行。\n');
          }
        }
      }

      progress.current = pending.map(s => s.id).join(',');
      writeFileSync(progressPath, JSON.stringify(progress, null, 2), 'utf-8');

      try {
        const results = await executeParallelGroup(pending, project, topic, projectRoot, config, projectDir, dispatcher, checkpoint, { ipcConfirm: confirm });
        let hasHardFailure = false;
        for (const r of results) {
          if (r.success || r.skipped) {
            stageTimings.push({ stage: r.stage, duration: r.duration, error: r.error });
            progress.completed.push(r.stage);
            if (r.skipped) {
              console.log(`  ⏭️  ${r.stage} 因 continueOnFailure 标记为 skipped 继续`);
            }
          } else {
            stageTimings.push({ stage: r.stage, duration: 0, error: r.error });
            console.error(`  ❌ ${r.stage} 失败: ${r.error}`);
            hasHardFailure = true;
          }
        }
        completedCount += pending.length;
        progress.current = null;
        writeFileSync(progressPath, JSON.stringify(progress, null, 2), 'utf-8');

        if (hasHardFailure) {
          console.log('  💡 可使用 --resume 选项从 checkpoint 恢复');
          break;
        }
      } catch (err) {
        console.error(`  ❌ 并行执行失败: ${err.message}`);
        console.log('  💡 可使用 --resume 选项从 checkpoint 恢复');
        progress.current = null;
        writeFileSync(progressPath, JSON.stringify(progress, null, 2), 'utf-8');
        break;
      }
    }
  }

  const finalPct = progress.completed.length === totalStages ? 100 : Math.round((progress.completed.length / totalStages) * 100);
  console.log(`\n🎉 流水线完成！ (${finalPct}%)`);

  // 流水线完成时清除 checkpoint
  if (finalPct === 100) {
    clearCheckpoint(projectDir);
    console.log('  🧹 checkpoint 已清除');
  }

  if (stageTimings.length > 0) {
    console.log('\n⏱️  阶段耗时统计:');
    let totalMs = 0;
    for (const t of stageTimings) {
      totalMs += t.duration;
      const suffix = t.error ? ` ❌ ${t.error}` : '';
      console.log(`  ${t.stage}: ${formatDuration(t.duration)}${suffix}`);
    }
    console.log(`  总计: ${formatDuration(totalMs)}`);
  }

  // 评审闭环（如果启用）
  if (options.enableReviewLoop) {
    console.log('\n🔄 启动评审闭环...');
    await reviewLoop(project, projectRoot, config, { dispatcher });
  }

  // P7.2: 评审反馈闭环 — 自动解析审稿意见并沉淀到知识候选池
  try {
    const reviewFiles = [
      resolve(projectDir, 'output/review-report.md'),
      resolve(projectDir, 'output/iterative-review-report.md'),
    ];
    const fp = new FeedbackParser();
    for (const rp of reviewFiles) {
      if (existsSync(rp)) {
        const content = readFileSync(rp, 'utf-8');
        const parsed = fp.parseFeedback(content);
        if (parsed.length > 0) {
          const pool = new KnowledgeCandidatePool(projectRoot);
          pool.ingestReviewFeedback(parsed.map(item => ({
            text: item.content,
            category: item.type,
          })));
          console.log(`  📝 已从评审报告沉淀 ${parsed.length} 条反馈到知识候选池`);
        }
      }
    }
  } catch (e) {
    console.error(`  ⚠️ 评审反馈闭环出错: ${e.message}`);
  }

  // 确保 common-pitfalls.md 存在
  try {
    const pitfallsPath = resolve(projectRoot, '.openpip', 'knowledge', 'writing', 'common-pitfalls.md');
    if (!existsSync(pitfallsPath)) {
      const dir = resolve(pitfallsPath, '..');
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(pitfallsPath, '# 常见问题总结\n\n> 本文件由审稿反馈闭环自动维护，记录多次出现的共性问题。\n\n', 'utf-8');
    }
  } catch {
    // common-pitfalls.md 创建失败，不影响主流程
  }

  if (tracingEnabled) {
    tracer.endTrace('completed');
    defaultLogger.info('Pipeline completed', {
      pipeline: pipelineName,
      project,
      trace_id: traceId,
    });
  }
}

function getProjectInfo(projectDir) {
  const info = { files: [] };
  for (const dir of ['research', 'drafts', 'output']) {
    const d = resolve(projectDir, dir);
    if (existsSync(d)) {
      for (const f of readdirSync(d)) {
        const fp = resolve(d, f);
        const stat = statSync(fp);
        info.files.push({ path: `${dir}/${f}`, size: stat.size, modified: stat.mtime });
      }
    }
  }
  info.files.sort((a, b) => b.modified - a.modified);
  return info;
}

module.exports = {
  loadPipeline,
  initProject,
  runPipeline,
  getProjectInfo,
  getDependencies,
  getExecutionGroups,
};


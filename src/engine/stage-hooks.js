const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs');
const { resolve, dirname } = require('path');
const { FactVerifier } = require('./quality/fact-verifier');
const { ReverseOutlineVerifier } = require('./quality/reverse-outline');
const { DataProvenance } = require('./output/data-provenance');
const { EventBus, EVENT_TYPES } = require('./infra/event-bus');
const { venueCheck } = require('./output/latex-exporter');

function ensureParentDir(filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function renderFactCheckReport(report, paperPath) {
  const lines = [
    '# 事实核查报告',
    '',
    `**生成时间**: ${new Date().toISOString()}`,
    `**论文文件**: ${paperPath}`,
    '',
    `**状态**: ${report.valid ? '✅ 通过' : '⚠️ 存在问题'}`,
    `**问题总数**: ${report.totalIssues}`,
    '',
  ];

  if (report.citationVerification) {
    lines.push('## 引用校验');
    lines.push(`- 有效引用: ${report.citationVerification.valid || 0}`);
    lines.push(`- 问题数: ${report.citationVerification.issues?.length || 0}`);
    for (const issue of (report.citationVerification.issues || [])) {
      lines.push(`  - [${issue.severity}] ${issue.description}`);
    }
    lines.push('');
  }

  if (report.dataConsistency) {
    lines.push('## 数据一致性');
    lines.push(`- 问题数: ${report.dataConsistency.issues?.length || 0}`);
    for (const issue of (report.dataConsistency.issues || [])) {
      lines.push(`  - [${issue.severity}] ${issue.description}`);
    }
    lines.push('');
  }

  if (report.hallucinationRisk) {
    lines.push('## 幻觉风险');
    lines.push(`- 问题数: ${report.hallucinationRisk.issues?.length || 0}`);
    for (const issue of (report.hallucinationRisk.issues || [])) {
      lines.push(`  - [${issue.severity}] ${issue.description}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

async function executeHookWithRetry(hookName, hookFn, projectDir, stageId) {
  const MAX_RETRIES = 2;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await hookFn();
      return { hook: hookName, status: 'ok', result };
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        console.log(`  🔄 Hook ${hookName} 第 ${attempt} 次失败，重试... (${err.message})`);
      }
    }
  }
  // 全部重试失败 → emit hook:failed 事件
  try {
    const bus = EventBus.getInstance();
    await bus.emit(EVENT_TYPES.HOOK_FAILED, {
      hook: hookName, stageId,
      error: lastErr.message,
      timestamp: new Date().toISOString(),
    });
  } catch (_) { /* emit 失败不影响主流程 */ }
  return { hook: hookName, status: 'failed', error: lastErr.message };
}

// P5.2: 按 hook 类型的降级策略
function getFallbackForHook(hookName) {
  const fallbacks = {
    'fact-verifier': async (projectDir, projectRoot) => {
      // 降级：只做引用校验（checkAll 中最轻量的部分）
      const verifier = new FactVerifier(projectRoot);
      const paperPath = resolve(projectDir, 'drafts/draft-v1.md');
      if (existsSync(paperPath)) {
        const citationResult = verifier.verifyCitations(paperPath);
        const reportPath = resolve(projectDir, 'output/fact-check-report.md');
        const md = `# 事实核查报告（降级模式 - 仅引用校验）\n\n**生成时间**: ${new Date().toISOString()}\n\n**原因**: checkAll 失败，降级到引用校验\n\n**问题数**: ${citationResult.issues.length}\n\n${citationResult.issues.map(i => `- [${i.severity}] ${i.description}`).join('\n')}`;
        writeFileSync(reportPath, md, 'utf-8');
        console.log(`  ⚠️ 事实核查降级: 仅引用校验，${citationResult.issues.length} 个问题`);
        return { downgraded: true, issues: citationResult.issues.length };
      }
      return { downgraded: true, issues: 0 };
    },
    'reverse-outline': async (projectDir, _projectRoot) => {
      // 降级：仅做大纲章节数对比（最简单检查）
      const outlinePath = resolve(projectDir, 'drafts/outline-v1.md');
      const draftPath = resolve(projectDir, 'drafts/draft-v1.md');
      if (existsSync(outlinePath) && existsSync(draftPath)) {
        const outlineText = readFileSync(outlinePath, 'utf-8');
        const draftText = readFileSync(draftPath, 'utf-8');
        const outlineChapters = (outlineText.match(/^##\s/gm) || []).length;
        const draftChapters = (draftText.match(/^##\s/gm) || []).length;
        const reportPath = resolve(projectDir, 'output/reverse-outline-report.md');
        const md = `# 反向大纲校验报告（降级模式 - 仅章节数对比）\n\n**大纲章节数**: ${outlineChapters}\n**草稿章节数**: ${draftChapters}\n**匹配**: ${outlineChapters === draftChapters ? '是' : '否'}\n`;
        writeFileSync(reportPath, md, 'utf-8');
        console.log(`  ⚠️ 反向大纲降级: 仅章节数对比，大纲 ${outlineChapters} 章 vs 草稿 ${draftChapters} 章`);
        return { downgraded: true, outlineChapters, draftChapters };
      }
      return { downgraded: true };
    },
  };
  return fallbacks[hookName] || null;
}

async function runPostStageHooks(stage, projectDir, projectRoot, pipelineName, config) {
  if (!stage || !stage.id) return [];
  const hooksLog = [];
  const hookEventsPath = resolve(projectDir, 'output/hook-events.log');

  function appendHookEvent(entry) {
    try {
      ensureParentDir(hookEventsPath);
      const ts = new Date().toISOString();
      const line = `[${ts}] [${entry.hook}] ${entry.status}: ${entry.message || ''}\n`;
      writeFileSync(hookEventsPath, line, { flag: 'a', encoding: 'utf-8' });
    } catch (_) { /* 日志写入失败不阻塞 */ }
  }

  function runHook(hookName, fn) {
    return executeHookWithRetry(hookName, fn, projectDir, stage.id);
  }

  // --- review stage: FactVerifier ---
  if (stage.id === 'review') {
    const paperPath = resolve(projectDir, 'drafts/draft-v1.md');
    if (existsSync(paperPath)) {
      const result = await runHook('fact-verifier', async () => {
        const verifier = new FactVerifier(projectRoot);
        const report = verifier.checkAll(paperPath);
        const reportPath = resolve(projectDir, 'output/fact-check-report.md');
        ensureParentDir(reportPath);
        const md = renderFactCheckReport(report, paperPath);
        writeFileSync(reportPath, md, 'utf-8');
        const tag = report.valid ? '✅' : '⚠️';
        console.log(`  ${tag} 事实核查: ${report.totalIssues} 个问题 → output/fact-check-report.md`);
        return { valid: report.valid, issues: report.totalIssues };
      });
      if (result.status === 'failed') {
        // 执行降级
        const fallback = getFallbackForHook('fact-verifier');
        if (fallback) {
          const fbResult = await fallback(projectDir, projectRoot);
          result.fallback = fbResult;
          result.status = 'downgraded';
          appendHookEvent({ hook: 'fact-verifier', status: 'downgraded', message: `checkAll失败→降级引用校验: ${fbResult.issues || 0} issues` });
        } else {
          appendHookEvent({ hook: 'fact-verifier', status: 'failed', message: result.error });
        }
      } else {
        appendHookEvent({ hook: 'fact-verifier', status: 'ok', message: `${result.result.issues} issues` });
      }
      hooksLog.push(result);
    }
  }

  // --- draft stage: ReverseOutlineVerifier + Citation ---
  if (stage.id === 'draft') {
    const outlinePath = resolve(projectDir, 'drafts/outline-v1.md');
    const draftPath = resolve(projectDir, 'drafts/draft-v1.md');
    if (existsSync(outlinePath) && existsSync(draftPath)) {
      const driftThreshold = stage.driftThreshold !== undefined ? stage.driftThreshold : 0.3;
      const result = await runHook('reverse-outline', async () => {
        const verifier = new ReverseOutlineVerifier(projectRoot);
        const driftResult = verifier.detectDrift(outlinePath, draftPath, driftThreshold);
        const reportPath = resolve(projectDir, 'output/reverse-outline-report.md');
        const report = verifier.generateReport(outlinePath, draftPath);
        writeFileSync(reportPath, report.report, 'utf-8');
        const tag = driftResult.isDrifted ? '⚠️' : '✅';
        console.log(`  ${tag} 反向大纲校验: driftScore=${driftResult.driftScore.toFixed(3)} (阈值 ${driftThreshold}) → output/reverse-outline-report.md`);
        if (driftResult.isDrifted) {
          try {
            const bus = EventBus.getInstance();
            await bus.emit(EVENT_TYPES.OUTLINE_DRIFT, {
              stage: stage.id,
              driftScore: driftResult.driftScore,
              driftThreshold: driftResult.driftThreshold,
              details: {
                missingSections: driftResult.missingSections,
                extraSections: driftResult.extraSections,
                deviatedSections: driftResult.deviatedSections,
                avgCoverage: driftResult.avgCoverage,
              },
              outlinePath,
              draftPath,
              reportPath,
              timestamp: new Date().toISOString(),
            });
            console.log(`  📡 触发 outline:drift 事件 (driftScore=${driftResult.driftScore.toFixed(3)})`);
          } catch (e) {
            console.log(`  ⚠️ drift 事件发射失败: ${e.message}`);
          }
        }
        return { ...driftResult, report: report.report, score: report.score };
      });
      if (result.status === 'failed') {
        const fallback = getFallbackForHook('reverse-outline');
        if (fallback) {
          const fbResult = await fallback(projectDir, projectRoot);
          result.fallback = fbResult;
          result.status = 'downgraded';
          appendHookEvent({ hook: 'reverse-outline', status: 'downgraded', message: `降级章节数对比: ${fbResult.outlineChapters || '?'} vs ${fbResult.draftChapters || '?'}` });
        } else {
          appendHookEvent({ hook: 'reverse-outline', status: 'failed', message: result.error });
        }
      } else {
        appendHookEvent({ hook: 'reverse-outline', status: 'ok', message: `driftScore=${result.result.driftScore.toFixed(3)}` });
        if (result.result.isDrifted) {
          try {
            const driftLogPath = resolve(projectDir, 'output/drift-replan.log');
            const ts = new Date().toISOString();
            const logLine = `[${ts}] DRIFT detected: driftScore=${result.result.driftScore.toFixed(3)}, threshold=${driftThreshold}, stage=${stage.id}\n`;
            writeFileSync(driftLogPath, logLine, { flag: 'a', encoding: 'utf-8' });
          } catch (_) {
            // drift 日志写入失败不影响主流程
          }
        }
      }
      hooksLog.push(result);
    }
  }

  // --- code stage: DataProvenance ---
  if (stage.id === 'code') {
    const result = await runHook('data-provenance', async () => {
      const provenance = new DataProvenance(projectRoot);
      provenance.fullScan();
      const report = provenance.generateReproducibilityReport();
      const reportPath = resolve(projectDir, 'output/reproducibility-report.md');
      writeFileSync(reportPath, report, 'utf-8');
      console.log('  ✅ 数据溯源扫描完成 → output/reproducibility-report.md');
      return { dataFiles: provenance.provenance.dataFiles.length, scripts: provenance.provenance.scripts.length };
    });
    appendHookEvent({ hook: 'data-provenance', status: result.status === 'failed' ? 'failed' : 'ok', message: result.error || '' });
    hooksLog.push(result);
  }

  // --- figure stage: figure-data-consistency ---
  if (stage.id === 'figure') {
    const draftPath = resolve(projectDir, 'drafts/draft-v1.md');
    const figuresDir = resolve(projectDir, 'figures');
    if (existsSync(draftPath) && existsSync(figuresDir)) {
      const result = await runHook('figure-data-consistency', async () => {
        const verifier = new FactVerifier(projectRoot);
        const consistencyResult = verifier.verifyDataConsistency(draftPath);
        const issues = consistencyResult.issues.filter(i => i.type === 'table_text_mismatch' || i.type === 'data_inconsistency');
        if (issues.length > 0) {
          const reportPath = resolve(projectDir, 'output/figure-data-consistency.md');
          const md = `# 图表数据一致性报告\n\n**生成时间**: ${new Date().toISOString()}\n\n**问题数**: ${issues.length}\n\n${issues.map(i => `- [${i.severity}] ${i.description}`).join('\n')}`;
          writeFileSync(reportPath, md, 'utf-8');
          console.log(`  ⚠️ 图表数据一致性: ${issues.length} 个问题 → output/figure-data-consistency.md`);
        } else {
          console.log('  ✅ 图表数据一致性校验通过');
        }
        return { issues: issues.length };
      });
      appendHookEvent({ hook: 'figure-data-consistency', status: result.status === 'failed' ? 'failed' : 'ok', message: result.error || `${result.result.issues} issues` });
      hooksLog.push(result);
    }
  }

  // --- draft stage: Citation verification (second hook in same stage) ---
  if (stage.id === 'draft') {
    const draftPath = resolve(projectDir, 'drafts/draft-v1.md');
    if (existsSync(draftPath)) {
      const result = await runHook('citation-verification', async () => {
        const verifier = new FactVerifier(projectRoot);
        const citationResult = verifier.verifyCitations(draftPath);
        if (!citationResult.valid) {
          const reportPath = resolve(projectDir, 'output/citation-verification.md');
          const md = `# 引用验证报告\n\n**生成时间**: ${new Date().toISOString()}\n\n**问题数**: ${citationResult.issues.length}\n\n${citationResult.issues.map(i => `- [${i.severity}] ${i.description}`).join('\n')}`;
          writeFileSync(reportPath, md, 'utf-8');
          console.log(`  ⚠️ 引用验证: ${citationResult.issues.length} 个问题 → output/citation-verification.md`);
        } else {
          console.log('  ✅ 引用验证通过');
        }
        return { valid: citationResult.valid, issues: citationResult.issues.length };
      });
      appendHookEvent({ hook: 'citation-verification', status: result.status === 'failed' ? 'failed' : 'ok', message: result.error || `${result.result.issues} issues` });
      hooksLog.push(result);
    }
  }

  // --- format/export stage: VenueCheck ---
  if (stage.id === 'format' || stage.id === 'export') {
    const paperPath = resolve(projectDir, 'output/paper.md');
    if (existsSync(paperPath)) {
      const result = await runHook('venue-check', async () => {
        const targetVenue = (config && config.targetVenue) || null;
        if (targetVenue && venueCheck) {
          const vResult = venueCheck(paperPath, targetVenue);
          if (!vResult.valid && vResult.issues.length > 0) {
            const reportPath = resolve(projectDir, 'output/venue-check-report.md');
            const md = `# Venue 合规检查报告\n\n**目标期刊**: ${targetVenue}\n**生成时间**: ${new Date().toISOString()}\n\n${vResult.issues.map(i => `- ⚠️ ${i}`).join('\n')}\n`;
            writeFileSync(reportPath, md, 'utf-8');
            console.log(`  ⚠️ Venue 检查: ${vResult.issues.length} 个问题 → output/venue-check-report.md`);
          } else {
            console.log(`  ✅ Venue 检查通过 (${targetVenue})`);
          }
          return { valid: vResult.valid, issues: vResult.issues.length };
        }
        return { valid: true, issues: 0, skipped: true };
      });
      appendHookEvent({ hook: 'venue-check', status: result.status === 'failed' ? 'failed' : 'ok', message: result.error || '' });
      hooksLog.push(result);
    }
  }

  return hooksLog;
}


module.exports = { executeHookWithRetry, getFallbackForHook, runPostStageHooks, renderFactCheckReport };

const { readFileSync, writeFileSync, existsSync, copyFileSync } = require('fs');
const { resolve } = require('path');
const readline = require('readline');
const { ITERATIVE_OUTPUTS } = require('./stage-constants');
const { saveCheckpoint } = require('./stage-helpers');

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

async function executeIterativeStage(stage, project, topic, projectRoot, config, projectDir, dispatch, checkpoint) {
  const stageStart = Date.now();
  const { iterativeReview } = require('./review/iterative-review');

  // 确保起始草稿存在（iterativeReview 从 draft-v2.md 开始读）
  const v1Path = resolve(projectDir, 'drafts/draft-v1.md');
  const v2Path = resolve(projectDir, 'drafts/draft-v2.md');
  if (!existsSync(v2Path)) {
    if (existsSync(v1Path)) {
      copyFileSync(v1Path, v2Path);
    } else {
      throw new Error('迭代优化失败：找不到草稿文件 (draft-v2.md / draft-v1.md)');
    }
  }

  const maxRounds = stage.maxIterations || 3;

  console.log(`\n  🔁 启动迭代优化（最多 ${maxRounds} 轮，多视角审稿 + IssueTracker）`);

  const result = await iterativeReview(project, projectRoot, config, {
    dispatcher: dispatch,
    maxRounds,
    onRoundEnd: async (roundInfo) => {
      // P8.4: HIL 暂停 — 每轮结束后可选人工介入
      if (stage.pauseOnIteration) {
        const score = roundInfo.roundRecord.scores?.total;
        const perspectiveName = roundInfo.roundRecord.perspectiveName;
        const answer = await ask(`\n  ⏸ 第 ${roundInfo.round} 轮完成 (${perspectiveName}视角, 评分 ${score !== null ? score.toFixed(1) : 'N/A'}/100)\n     操作: [回车=继续, s=停止]: `);
        if (answer.trim().toLowerCase() === 's') {
          console.log('  ⏹ 用户中止迭代');
          return true; // shouldStop = true → break
        }
      }
      return false;
    },
  });

  // P6.4: 多版本草稿对比择优（扫描 draft-v2, draft-v3, ...）
  const draftFiles = [];
  for (let i = 2; i <= maxRounds + 2; i++) {
    const dp = resolve(projectDir, `drafts/draft-v${i}.md`);
    if (existsSync(dp)) draftFiles.push({ version: i, path: dp });
  }
  if (draftFiles.length >= 2) {
    const comparisonPath = resolve(projectDir, 'output/draft-comparison.md');
    const lines = ['# 多版本草稿对比报告', '', `**生成时间**: ${new Date().toISOString()}`];
    lines.push(`**迭代轮数**: ${result.rounds}`);
    lines.push('', '## 各版本概览', '', '| 版本 | 文件 | 字符数 |');
    lines.push('|------|------|--------|');
    for (const df of draftFiles) {
      const content = readFileSync(df.path, 'utf-8');
      lines.push(`| v${df.version} | draft-v${df.version}.md | ${content.length} |`);
    }
    
    lines.push('', `**推荐版本**: draft-v${draftFiles.length + 1}.md（最新一轮）`);
    lines.push('', `**终止原因**: ${result.stoppedReason}`);
    lines.push('', `**中位数评分**: ${result.lastTotal !== null ? result.lastTotal.toFixed(1) : 'N/A'}/100`);
    const md = lines.join('\n');
    writeFileSync(comparisonPath, md, 'utf-8');
    console.log(`  📊 多版本对比: ${comparisonPath} (推荐 draft-v${draftFiles.length + 1}.md)`);
  }

  // 保存最终草稿
  const finalDraftPath = resolve(projectDir, ITERATIVE_OUTPUTS.draftFinal);
  const latestDraft = resolve(projectDir, `drafts/draft-v${draftFiles.length + 1}.md`);
  if (existsSync(latestDraft)) {
    const finalContent = readFileSync(latestDraft, 'utf-8');
    writeFileSync(finalDraftPath, finalContent, 'utf-8');
    console.log(`  📄 最终草稿已保存: ${ITERATIVE_OUTPUTS.draftFinal}`);
  }

  const elapsed = Date.now() - stageStart;

  if (checkpoint) {
    checkpoint.stages.push({
      stage_id: stage.id,
      output_path: ITERATIVE_OUTPUTS.reviewReport || 'output/iterative-review-report.md',
      timestamp: new Date().toISOString(),
      qualityScore: result.lastTotal,
      success: true,
      duration: elapsed,
      iterations: result.rounds,
    });
    saveCheckpoint(projectDir, checkpoint);
  }

  return {
    stage: stage.id,
    success: true,
    length: 0,
    duration: elapsed,
    qualityScore: result.lastTotal,
    iterations: result.rounds,
    converged: result.convergence?.converged || false,
  };
}

function parseScore(text) {
  const m = text.match(/(\d+)\s*\/\s*100/);
  return m ? parseInt(m[1], 10) : 50;
}

function parseDecision(text) {
  if (/Severe/i.test(text)) return 'Severe';
  if (/Major/i.test(text)) return 'Major';
  if (/Minor/i.test(text)) return 'Minor';
  if (/Accept/i.test(text)) return 'Accept';
  return 'Minor';
}

function routeByDecision(decision, routing) {
  const key = decision.toLowerCase();
  return routing[key] || routing.minor || 'writer';
}

function renderIterativeReport(log, finalDraft) {
  const lines = [];
  lines.push('# 迭代优化报告');
  lines.push('');
  lines.push(`**生成时间**: ${new Date().toISOString()}`);
  lines.push(`**迭代轮数**: ${log.length}`);
  lines.push(`**最终收敛**: ${log.some(l => l.converged) ? '✅ 是' : '❌ 否（达到最大轮数）'}`);
  lines.push('');
  lines.push('## 迭代轨迹');
  lines.push('');
  lines.push('| 轮次 | 评分 | 决策 | 路由 | 子任务 | 分数提升 | 相似度 | 收敛 |');
  lines.push('|------|------|------|------|--------|----------|--------|------|');
  for (const l of log) {
    lines.push(`| ${l.iteration} | ${l.score} | ${l.decision} | ${l.routeAgent} | ${l.subtask} | ${l.scoreImprove > 0 ? '+' : ''}${l.scoreImprove} | ${l.similarity.toFixed(3)} | ${l.converged ? '✅' : '—'} |`);
  }
  lines.push('');
  lines.push('## 最终草稿预览');
  lines.push('');
  lines.push(finalDraft.substring(0, 1000));
  if (finalDraft.length > 1000) lines.push('\n...(已截断)');
  return lines.join('\n');
}

module.exports = {
  executeIterativeStage,
  parseScore,
  parseDecision,
  routeByDecision,
  renderIterativeReport,
};

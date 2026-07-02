const path = require('path');
const fs = require('fs');
const { confirm } = require('../utils/readline');
const { findProjectDir } = require('../services/project-service');

module.exports = async function(args, engine, ROOT, _config) {
  const project = args[1];
  const autoMode = args.includes('--auto');

  if (!project) {
    console.error('用法: openpip evolve <项目名> [--auto]');
    return;
  }

  const projectDir = findProjectDir(ROOT, project);
  if (!projectDir) {
    console.error(`项目 '${project}' 不存在`);
    return;
  }
  const reviewPath = path.join(projectDir, 'output', 'review-report.md');
  const iterativeReviewPath = path.join(projectDir, 'output', 'iterative-review-report.md');

  let reportPath = reviewPath;
  if (!fs.existsSync(reviewPath) && fs.existsSync(iterativeReviewPath)) {
    reportPath = iterativeReviewPath;
  }

  if (!fs.existsSync(reportPath)) {
    console.error(`❌ 未找到审稿报告: ${reviewPath}`);
    console.error(`   也检查了: ${iterativeReviewPath}`);
    return;
  }

  const reviewText = fs.readFileSync(reportPath, 'utf-8');
  console.log(`📄 审稿报告: ${reportPath}`);

  const se = require('../../engine/features/self-evolution');
  const patterns = se.extractPatterns(reviewText, ROOT);

  if (patterns.length === 0) {
    console.log('\n✅ 未检测到已知失败模式，无需改进。');
    return;
  }

  const report = se.generateReport(patterns, ROOT);
  console.log('\n' + report);

  if (autoMode) {
    console.log('\n🔄 自动模式: 直接应用所有改进...');
  } else {
    const proceed = await confirm('\n是否应用这些改进? (y/n): ');
    if (!proceed) {
      console.log('已取消。');
      return;
    }
  }

  const results = se.applyImprovements(patterns, { dryRun: false });
  for (const r of results) {
    if (r.status === 'applied') {
      console.log(`  ✅ ${r.pattern_id} → ${r.target}`);
      se.recordImprovement(ROOT, r.pattern_id, r.target);
    } else {
      console.log(`  ⏭️  ${r.pattern_id}: ${r.status} (${r.reason || ''})`);
    }
  }

  const scoreMatch = reviewText.match(/综合评分[：:]\s*(\d+)/);
  const decisionMatch = reviewText.match(/决策[：:]\s*(\w+)/);
  se.saveHistory(ROOT, {
    project,
    version: 'v0',
    score: scoreMatch ? parseInt(scoreMatch[1]) : null,
    decision: decisionMatch ? decisionMatch[1] : null,
    failure_patterns: patterns.map(p => p.id)
  });

  console.log('\n📊 进化历史已更新。');
};

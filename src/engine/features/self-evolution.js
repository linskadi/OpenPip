const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs');
const { resolve, join } = require('path');
const { loadJsonFile } = require('../utils');

const FAILURE_PATTERNS = [
  {
    id: 'low-r2',
    detect: /R[²2].*?0\.\d{1,2}|pseudo.?R[²2].*?0\.\d{1,2}/gi,
    severity: 'high',
    suggestion: '因变量可能需要非线性模型（GLM/GAM/有序Logit）',
    prompt_target: 'coder.md',
    inject_text: '\n### 方法选择提醒\n- R²<0.2 时考虑 GLM/GAM 替代线性回归\n'
  },
  {
    id: 'overfitting',
    detect: /过拟合|overfit|训练.*?AUC.*?验证.*?AUC|gap.*?0\.\d{2,}/gi,
    severity: 'high',
    suggestion: '增加正则化参数（max_depth, min_samples_leaf）',
    prompt_target: 'coder.md',
    inject_text: '\n### 过拟合防范\n- RF/XGBoost 必须设置 max_depth 和 min_samples_leaf\n- 报告训练/验证差距，差距>0.15需讨论\n'
  },
  {
    id: 'no-conclusion',
    detect: /缺少结论|无结论章|结论.*?缺失/gi,
    severity: 'medium',
    suggestion: '添加独立结论章节',
    prompt_target: 'writer.md',
    inject_text: '\n### 必须项\n- 竞赛论文必须有独立的第七章结论\n'
  },
  {
    id: 'no-stats',
    detect: /无统计检验|缺少.*?p-value|未报告.*?std/gi,
    severity: 'high',
    suggestion: '所有对比实验添加 mean±std 和 p-value',
    prompt_target: 'writer.md',
    inject_text: '\n### 统计规范\n- 所有对比实验必须报告 mean±std\n- 所有假设检验必须报告 p-value\n'
  },
  {
    id: 'figure-missing',
    detect: /图.*?缺失|未.*?includegraphics|figure.*?not found/gi,
    severity: 'high',
    suggestion: '确保所有图表显式集成到 LaTeX',
    prompt_target: 'formatter.md',
    inject_text: '\n### 图表集成检查\n- 每个图必须有 \\includegraphics 命令\n- 编译后检查 PDF 中图表是否显示\n'
  },
  {
    id: 'enumeration',
    detect: /枚举.*?优化|穷举.*?解|brute.?force/gi,
    severity: 'high',
    suggestion: '多目标优化使用 NSGA-II 替代枚举',
    prompt_target: 'coder.md',
    inject_text: '\n### 优化方法\n- 变量>5 时禁止枚举法，必须使用 NSGA-II\n'
  },
  {
    id: 'low-score',
    detect: /综合评分.*?([56])\.\d|(\d+)\/100.*?(Major|Reject)/gi,
    severity: 'critical',
    suggestion: '整体质量不足，需要全面改进',
    prompt_target: null,
    inject_text: null
  }
];

function extractPatterns(reviewText, projectRoot, score) {
  if (!reviewText || typeof reviewText !== 'string') return [];
  const matched = [];
  const seen = new Set();
  for (const pattern of FAILURE_PATTERNS) {
    const matches = reviewText.match(pattern.detect);
    if (matches && !seen.has(pattern.id)) {
      seen.add(pattern.id);
      matched.push({
        id: pattern.id,
        severity: pattern.severity,
        suggestion: pattern.suggestion,
        prompt_target: pattern.prompt_target,
        inject_text: pattern.inject_text,
        matched_text: matches[0]
      });
    }
  }

  if (matched.length === 0 && typeof score === 'number' && score < 7) {
    matched.push({
      id: 'unknown-failure',
      severity: 'medium',
      suggestion: '评审评分偏低但未匹配已知模式，需人工分析',
      prompt_target: null,
      inject_text: null,
    });
  }

  if (projectRoot && matched.length > 0) {
    const history = getHistory(projectRoot);
    const fixed = new Set((history.improvements_applied || []).map(i => i.pattern_id));
    matched.forEach(p => { if (fixed.has(p.id)) p.severity = 'critical'; });
  }

  return matched;
}

function detectRegressions(projectRoot, currentPatterns) {
  const history = getHistory(projectRoot);
  const previousPatterns = new Set();
  history.runs.forEach(r => (r.failure_patterns || []).forEach(p => previousPatterns.add(p)));
  return currentPatterns.filter(p => previousPatterns.has(p.id));
}

function generateReport(patterns, projectRoot) {
  if (!patterns || patterns.length === 0) {
    return '## 自进化分析报告\n\n未检测到已知失败模式。\n';
  }
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...patterns].sort((a, b) => {
    const aVal = severityOrder[a.severity];
    const bVal = severityOrder[b.severity];
    return (aVal !== undefined ? aVal : 9) - (bVal !== undefined ? bVal : 9);
  });
  let report = '## 自进化分析报告\n\n';
  report += `检测到 **${patterns.length}** 个失败模式:\n\n`;
  report += '| 模式 | 严重度 | 说明 | 目标Prompt |\n';
  report += '|------|--------|------|------------|\n';
  for (const p of sorted) {
    report += `| ${p.id} | ${p.severity} | ${p.suggestion} | ${p.prompt_target || '(无)'} |\n`;
  }
  report += '\n### 建议改进操作\n\n';
  for (const p of sorted) {
    if (p.inject_text) {
      report += `**${p.id}** → 注入到 \`${p.prompt_target}\`:\n\`\`\`\n${p.inject_text.trim()}\n\`\`\`\n\n`;
    } else {
      report += `**${p.id}** → 需要手动处理: ${p.suggestion}\n\n`;
    }
  }

  if (projectRoot) {
    const history = getHistory(projectRoot);
    const regressions = detectRegressions(projectRoot, patterns);
    if (regressions.length > 0) {
      report += '### ⚠️ 回归检测\n\n以下模式曾经修复但再次出现:\n\n';
      for (const r of regressions) {
        report += `- **${r.id}**: ${r.suggestion}\n`;
      }
      report += '\n';
    }

    report += '### 历史摘要\n\n';
    report += `- 总运行次数: ${history.runs.length}\n`;
    report += `- 已应用改进数: ${(history.improvements_applied || []).length}\n`;
    const uniquePatterns = new Set();
    history.runs.forEach(r => (r.failure_patterns || []).forEach(p => uniquePatterns.add(p)));
    report += `- 累计检测模式: ${uniquePatterns.size}\n\n`;
  }

  return report;
}

function applyImprovements(patterns, options = {}) {
  const { dryRun = false, promptsDir } = options;
  const results = [];
  const dir = promptsDir || resolve(process.cwd(), '.openpip', 'role-prompts');
  for (const p of patterns) {
    if (!p.prompt_target || !p.inject_text) {
      results.push({ pattern_id: p.id, status: 'skipped', reason: 'no target prompt' });
      continue;
    }
    const filePath = join(dir, p.prompt_target);
    if (!existsSync(filePath)) {
      results.push({ pattern_id: p.id, status: 'skipped', reason: `file not found: ${p.prompt_target}` });
      continue;
    }
    const content = readFileSync(filePath, 'utf-8');
    if (content.includes(p.inject_text.trim())) {
      results.push({ pattern_id: p.id, status: 'already_present', reason: 'improvement already in prompt' });
      continue;
    }
    if (dryRun) {
      results.push({ pattern_id: p.id, status: 'would_apply', target: p.prompt_target });
      continue;
    }
    writeFileSync(filePath, content + p.inject_text, 'utf-8');
    results.push({ pattern_id: p.id, status: 'applied', target: p.prompt_target });
  }
  return results;
}

function getHistoryPath(projectRoot) {
  const dir = resolve(projectRoot, '.openpip');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, 'evolution-history.json');
}

function getHistory(projectRoot) {
  const filePath = getHistoryPath(projectRoot);
  return loadJsonFile(filePath, { runs: [], improvements_applied: [] });
}

function saveHistory(projectRoot, runData) {
  const history = getHistory(projectRoot);
  if (runData) {
    history.runs.push({
      id: `run-${String(history.runs.length + 1).padStart(3, '0')}`,
      ...runData,
      timestamp: new Date().toISOString()
    });
  }
  writeFileSync(getHistoryPath(projectRoot), JSON.stringify(history, null, 2), 'utf-8');
  return history;
}

function recordImprovement(projectRoot, patternId, filePath) {
  const history = getHistory(projectRoot);
  history.improvements_applied.push({
    pattern_id: patternId,
    file: filePath,
    applied_at: new Date().toISOString()
  });
  writeFileSync(getHistoryPath(projectRoot), JSON.stringify(history, null, 2), 'utf-8');
  return history;
}

module.exports = {
  FAILURE_PATTERNS,
  extractPatterns,
  generateReport,
  applyImprovements,
  getHistory,
  saveHistory,
  recordImprovement,
  detectRegressions,
};

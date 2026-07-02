const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs');
const { resolve } = require('path');
const crypto = require('crypto');
const { getDefaultDispatcher } = require('../dispatcher-registry');
const { detectConvergence } = require('../state/convergence-detector');
const { parseReviewIssues, classifySeverity, routeBySeverity } = require('./review-parser');
const { loadJsonFile } = require('../utils');
const { formatReportHeader } = require('../quality/report-formatter');

// 数学建模类论文的目标分数
const MATH_MODELING_TARGET_SCORE = 80;
// 默认目标分数
const DEFAULT_TARGET_SCORE = 85;
// 分数提升阈值：连续提升低于此值视为收敛
const SCORE_IMPROVE_THRESHOLD = 2;

// ============================================================
// IssueTracker：语义级审稿问题追踪
// 维护问题 hash → 状态映射，检测问题是否被修改稿解决
// ============================================================

class IssueTracker {
  constructor() {
    this.issues = new Map(); // hash -> { text, severity, firstSeen, lastSeen, resolved, count }
  }

  _hash(text) {
    return crypto.createHash('md5').update(text.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 80)).digest('hex').slice(0, 12);
  }

  register(problem, severity) {
    const hash = this._hash(problem);
    if (this.issues.has(hash)) {
      const existing = this.issues.get(hash);
      existing.lastSeen = Date.now();
      existing.count++;
      existing.resolved = false;
      return { hash, existing: true, count: existing.count };
    }
    this.issues.set(hash, {
      text: problem.slice(0, 200),
      severity,
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      resolved: false,
      count: 1,
    });
    return { hash, existing: false, count: 1 };
  }

  checkResolved(problem, draftContent) {
    const hash = this._hash(problem);
    if (!this.issues.has(hash)) return true; // 新问题，标记为未解决
    const issue = this.issues.get(hash);
    // 检查草稿中是否仍然包含问题关键词
    const keywords = problem.replace(/[，。、；：！？【】（）《》\s]+/g, ' ').split(' ').filter(k => k.length > 2);
    if (keywords.length === 0) return false;
    // 如果大部分关键词仍在草稿中，问题未解决
    const foundCount = keywords.filter(k => draftContent.includes(k)).length;
    const stillPresent = foundCount / keywords.length > 0.6;
    if (!stillPresent) {
      issue.resolved = true;
      return true;
    }
    return false;
  }

  getOpenIssues() {
    return Array.from(this.issues.values()).filter(i => !i.resolved);
  }

  getResolvedIssues() {
    return Array.from(this.issues.values()).filter(i => i.resolved);
  }

  getResolutionRate() {
    const total = this.issues.size;
    if (total === 0) return 1;
    return this.getResolvedIssues().length / total;
  }

  getSummary() {
    return {
      total: this.issues.size,
      open: this.getOpenIssues().length,
      resolved: this.getResolvedIssues().length,
      resolutionRate: this.getResolutionRate(),
      repeatedIssues: Array.from(this.issues.values()).filter(i => i.count > 2).length,
    };
  }
}

// ============================================================
// 多视角评审系统
// ============================================================

const PERSPECTIVES = {
  strict: {
    name: '严格',
    description: '高标准严要求，关注细节瑕疵，以顶刊标准评审',
    systemPrompt: `你是一位严格的学术审稿人，以顶级期刊的标准评审论文。你关注每一个细节瑕疵，
对写作质量、方法严谨性、数据分析的充分性都有极高要求。即使是小问题也要指出。
评分会偏保守，只有真正优秀的论文才能获得高分。`,
    scoreBias: -5,
  },
  balanced: {
    name: '平衡',
    description: '客观中立评审，兼顾优点和不足',
    systemPrompt: `你是一位客观中立的学术审稿人。你公正地评价论文的优点和不足，
既肯定创新性和贡献，也指出需要改进的地方。评分客观公正。`,
    scoreBias: 0,
  },
  lenient: {
    name: '宽松',
    description: '鼓励性评审，关注核心贡献，容忍次要瑕疵',
    systemPrompt: `你是一位鼓励性的学术审稿人。你关注论文的核心贡献和创新性，
对次要的写作瑕疵和格式问题较为宽容。只要论文在关键方面表现良好，就给予较高评价。`,
    scoreBias: 5,
  },
};

const PERSPECTIVE_KEYS = Object.keys(PERSPECTIVES);

function getPerspectiveForRound(round) {
  return PERSPECTIVE_KEYS[round % PERSPECTIVE_KEYS.length];
}

// 提取评审维度（用于收敛检测）
function extractDimensions(text) {
  const dims = new Set();
  const keywords = [
    '创新性', '方法', '实验', '写作', '格式', '引用', '逻辑',
    '数据', '文献', '综述', '术语', '图表', '结论', '摘要',
  ];
  for (const kw of keywords) {
    if (text.includes(kw)) dims.add(kw);
  }
  const matches = text.match(/维度[：:]\s*(\S+)/g);
  if (matches) {
    for (const m of matches) {
      dims.add(m.replace(/维度[：:]\s*/, ''));
    }
  }
  return dims;
}

// 评分提取（从评审文本中提取各维度分数和总分）
function extractScores(text) {
  const scores = [];
  const dimScores = {};

  const dimPattern = /(\S+?)[：:]\s*(\d+(?:\.\d+)?)\s*(?:分|\/100)?/g;
  let match;
  while ((match = dimPattern.exec(text)) !== null) {
    const name = match[1];
    const score = parseFloat(match[2]);
    if (score >= 0 && score <= 100) {
      dimScores[name] = score;
      scores.push(score);
    }
  }

  const totalMatch = text.match(/总分[：:]\s*(\d+(?:\.\d+)?)/);
  const total = totalMatch ? parseFloat(totalMatch[1]) : (scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null);

  return { total, dimScores, scores };
}

// 少数意见提取（多轮中仅出现一次的意见）
function extractMinorityOpinions(allRoundComments) {
  const opinionCounts = new Map();

  for (const round of allRoundComments) {
    for (const c of round) {
      const key = c.problem.substring(0, 50);
      if (!opinionCounts.has(key)) {
        opinionCounts.set(key, { comment: c, count: 0 });
      }
      opinionCounts.get(key).count++;
    }
  }

  const minority = [];
  for (const [, entry] of opinionCounts) {
    if (entry.count === 1) {
      minority.push(entry.comment);
    }
  }

  return minority;
}

// 生成修改提示
function buildFixPrompt(project, comment, round) {
  const agent = routeBySeverity(comment.severity);
  const draftFile = round === 1 ? 'draft-v2.md' : `draft-v${round + 1}.md`;
  const outputFile = `draft-v${round + 2}.md`;

  return {
    agent,
    prompt: `根据审稿意见修改论文（第 ${round + 1} 轮迭代）。

## 审稿意见
- 严重程度: ${comment.severity}
- 问题: ${comment.problem}
- 位置: ${comment.location}
- 建议: ${comment.suggestion}

## 任务
1. 读取 papers/${project}/drafts/${draftFile}
2. 针对上述问题进行修改
3. 将修改后的内容保存到 papers/${project}/drafts/${outputFile}
4. 列出所有修改点`,
  };
}

// 中位数评分计算
function medianScore(roundScores) {
  const totals = roundScores
    .filter(s => s !== null && s !== undefined)
    .sort((a, b) => a - b);
  if (totals.length === 0) return null;
  const mid = Math.floor(totals.length / 2);
  return totals.length % 2 === 0
    ? (totals[mid - 1] + totals[mid]) / 2
    : totals[mid];
}

// 生成迭代报告
function generateReport(project, rounds, config, stoppedReason, minorityOpinions, issueSummary) {
  const lines = [];
  lines.push(formatReportHeader(`迭代评审报告 — ${project}`, {
    '生成时间': new Date().toISOString(),
  }));

  // 终止原因
  lines.push('## 终止条件\n');
  lines.push(`- 原因: ${stoppedReason}\n`);

  // 各轮摘要
  lines.push('## 各轮评审摘要\n');
  for (const round of rounds) {
    lines.push(`### 第 ${round.round} 轮 — ${round.perspectiveName || '默认'}视角`);
    lines.push(`- 视角: ${round.perspective} (${round.perspectiveName || round.perspective})`);
    lines.push(`- 意见数: ${round.comments.length}`);
    if (round.scores) {
      lines.push(`- 总分: ${round.scores.total !== null ? round.scores.total.toFixed(1) : 'N/A'}`);
      if (Object.keys(round.scores.dimScores).length > 0) {
        lines.push(`- 维度分数: ${JSON.stringify(round.scores.dimScores)}`);
      }
    }
    if (round.prevTotal !== undefined && round.scores && round.scores.total !== null) {
      const delta = round.scores.total - round.prevTotal;
      lines.push(`- 分数变化: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`);
    }
    lines.push('');
  }

  // 多视角分数汇总
  if (rounds.length >= 3) {
    const allTotals = rounds.map(r => r.scores?.total).filter(t => t !== null && t !== undefined);
    const med = medianScore(allTotals);
    lines.push('## 多视角汇总\n');
    lines.push(`- 中位数总分: ${med !== null ? med.toFixed(1) : 'N/A'}`);
    lines.push(`- 各轮视角: ${rounds.map(r => `${r.perspective}(${r.scores?.total !== null ? r.scores.total.toFixed(1) : 'N/A'})`).join(', ')}`);
    lines.push('');
  }

  // IssueTracker 问题解决摘要
  if (issueSummary) {
    lines.push('## IssueTracker 问题追踪\n');
    lines.push(`- 总问题数: ${issueSummary.total}`);
    lines.push(`- 已解决: ${issueSummary.resolved} (${(issueSummary.resolutionRate * 100).toFixed(0)}%)`);
    lines.push(`- 未解决: ${issueSummary.open}`);
    lines.push(`- 重复出现的问题: ${issueSummary.repeatedIssues}`);
    lines.push('');
  }

  // 少数意见
  if (minorityOpinions.length > 0) {
    lines.push('## 保留的少数意见\n');
    lines.push('以下意见仅在某一轮评审中出现，未被多数轮次重复提及，但仍需关注：\n');
    for (const op of minorityOpinions) {
      lines.push(`- [${op.severity}] ${op.problem}`);
      if (op.suggestion) lines.push(`  建议: ${op.suggestion}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================
// 主函数：Writer↔Reviewer 攻防迭代（多视角）
// ============================================================

async function iterativeReview(project, projectRoot, config, options = {}) {
  console.log('\n🔄 启动迭代评审（Writer↔Reviewer 多视角攻防 + IssueTracker）...');
  const dispatcher = options.dispatcher || getDefaultDispatcher();
  const maxRounds = options.maxRounds || 3;
  const classification = (() => {
    const bbPath = resolve(projectRoot, 'papers', project, 'state', 'blackboard.json');
    const bb = loadJsonFile(bbPath, null);
    return bb?.classification || null;
  })();
  const isMathModeling = classification && classification.firstClass === '数学建模类';
  const targetScore = isMathModeling ? MATH_MODELING_TARGET_SCORE : DEFAULT_TARGET_SCORE;
  const scoreImproveThreshold = SCORE_IMPROVE_THRESHOLD;

  const issueTracker = new IssueTracker();
  const allRounds = [];
  let lastTotal = null;
  let consecutiveSmallImprove = 0;
  let stoppedReason = '';

  const draftDir = resolve(projectRoot, 'papers', project, 'drafts');
  if (!existsSync(draftDir)) mkdirSync(draftDir, { recursive: true });

  for (let round = 0; round < maxRounds; round++) {
    const perspective = getPerspectiveForRound(round);
    const perspectiveConfig = PERSPECTIVES[perspective];

    console.log(`\n📝 === 第 ${round + 1} 轮评审 ===`);
    console.log(`  🎯 视角: ${perspectiveConfig.name} (${perspective})`);

    // 读取当前草稿（第 round 轮评审输入 = draft-v(round+1).md，输出 = draft-v(round+2).md）
    const draftFile = `draft-v${round + 1}.md`;
    const draftPath = resolve(draftDir, draftFile);
    let draftContent = '';
    try { draftContent = readFileSync(draftPath, 'utf-8'); } catch { /* 草稿尚未生成，使用空字符串 */ }

    // IssueTracker：报告未解决问题的数量
    const openIssues = issueTracker.getOpenIssues();
    if (openIssues.length > 0) {
      console.log(`  📋 遗留未解决问题: ${openIssues.length} 个`);
      console.log(`  📊 问题解决率: ${(issueTracker.getResolutionRate() * 100).toFixed(0)}%`);
    }

    // 1. Reviewer 审稿（使用当前视角的系统提示 + IssueTracker 上下文）
    let issueContext = '';
    if (openIssues.length > 0) {
      issueContext = `\n注意：以下问题在上一轮已提出但尚未解决，请特别关注是否已被修正：\n${openIssues.map(i => `- [${i.severity}] ${i.text}`).join('\n')}`;
    }

    const reviewPrompt = `${perspectiveConfig.systemPrompt}

对论文进行第 ${round + 1} 轮审稿。

## 任务
1. 读取 papers/${project}/drafts/${draftFile}
2. 按维度评分（创新性/方法/实验/写作等，每维度 0-100）
3. 给出总分
4. 列出问题意见，标注严重程度（高/中/低）
${issueContext}
## 输出格式
每条意见使用：
### 意见N：[严重程度：高/中/低]
- **问题**: ...
- **位置**: ...
- **建议**: ...

最后给出各维度分数和总分。`;

    console.log('  📋 Reviewer 审稿中...');
    const reviewResult = await dispatcher('reviewer', reviewPrompt, project, projectRoot, config);

    // 2. 解析意见和分数
    const comments = parseReviewIssues(reviewResult);
    const scores = extractScores(reviewResult);
    const dimensions = extractDimensions(reviewResult);

    // 应用视角偏置
    if (scores.total !== null) {
      scores.total = Math.min(100, Math.max(0, scores.total + perspectiveConfig.scoreBias));
    }

    console.log(`  意见数: ${comments.length}, 总分: ${scores.total !== null ? scores.total.toFixed(1) : 'N/A'} (视角偏置: ${perspectiveConfig.scoreBias > 0 ? '+' : ''}${perspectiveConfig.scoreBias})`);

    // IssueTracker：保存本轮注册前的开放问题（仅检查上一轮遗留问题）
    const prevOpenIssues = issueTracker.getOpenIssues();

    // IssueTracker：注册本轮问题
    for (const c of comments) {
      issueTracker.register(c.problem, c.severity);
    }

    // IssueTracker：仅检查上一轮问题是否已在本轮草稿中解决
    if (draftContent) {
      for (const issue of prevOpenIssues) {
        issueTracker.checkResolved(issue.text, draftContent);
      }
    }

    // 记录本轮
    const roundRecord = {
      round: round + 1,
      perspective,
      perspectiveName: perspectiveConfig.name,
      comments,
      scores,
      dimensions,
      prevTotal: lastTotal,
      result: reviewResult,
      issueResolution: issueTracker.getSummary(),
    };
    allRounds.push(roundRecord);

    // 3. 检查终止条件

    // 条件1：总分达标
    if (scores.total !== null && scores.total >= targetScore) {
      stoppedReason = `总分 ${scores.total.toFixed(1)} 达到目标 ${targetScore}（${perspectiveConfig.name}视角）`;
      console.log(`  ✅ ${stoppedReason}`);
      break;
    }

    // 条件2：问题全部解决
    if (issueTracker.getResolutionRate() >= 0.9 && issueTracker.getOpenIssues().length === 0) {
      stoppedReason = '所有审稿问题已解决';
      console.log(`  ✅ ${stoppedReason}`);
      break;
    }

    // 条件3：连续两轮分数提升 < 2
    if (lastTotal !== null && scores.total !== null) {
      const delta = scores.total - lastTotal;
      if (Math.abs(delta) < scoreImproveThreshold) {
        consecutiveSmallImprove++;
        console.log(`  📊 分数提升 ${delta.toFixed(1)} < ${scoreImproveThreshold}`);
        if (consecutiveSmallImprove >= 2) {
          stoppedReason = '连续两轮分数提升不足 2 分';
          console.log(`  ⏹️ ${stoppedReason}`);
          break;
        }
      } else {
        consecutiveSmallImprove = 0;
      }
    }

    lastTotal = scores.total;

    // 4. 按严重程度分发修改任务
    if (comments.length === 0) {
      stoppedReason = '无评审意见，提前终止';
      console.log('  ⏹️ 无评审意见');
      break;
    }

    // 分组：轻/中/重
    const groups = { light: [], medium: [], heavy: [] };
    for (const c of comments) {
      const level = classifySeverity(c.severity);
      groups[level].push(c);
    }

    console.log(`  重: ${groups.heavy.length}, 中: ${groups.medium.length}, 轻: ${groups.light.length}`);

    const outputDraft = `draft-v${round + 2}.md`;
    const outputPath = resolve(draftDir, outputDraft);
    let accumulatedDraft = '';
    try {
      if (existsSync(outputPath)) accumulatedDraft = readFileSync(outputPath, 'utf-8');
    } catch {
      // 草稿文件读取失败时从空字符串开始追加，不影响后续修改
    }
    for (const level of ['heavy', 'medium', 'light']) {
      for (const comment of groups[level]) {
        const { agent, prompt } = buildFixPrompt(project, comment, round);
        console.log(`  🔧 派遣 ${agent} 处理: ${comment.problem.substring(0, 40)}...`);
        try {
          const fixResult = await dispatcher(agent, prompt, project, projectRoot, config);
          accumulatedDraft += '\n\n' + fixResult;
          writeFileSync(outputPath, accumulatedDraft, 'utf-8');
          console.log('  ✅ 完成');
        } catch (err) {
          console.log(`  ❌ 失败: ${err.message}`);
        }
      }
    }

    // 回调：外部包装器可在此插桩（HIL、多版本对比等）
    if (options.onRoundEnd) {
      const shouldStop = await options.onRoundEnd({
        round: round + 1,
        roundRecord,
        issueTracker,
        stoppedReason,
      });
      if (shouldStop) break;
    }
  }

  // 若自然结束未触发终止原因
  if (!stoppedReason) {
    stoppedReason = `达到最大迭代轮数 ${maxRounds}`;
  }

  // 收敛检测（跨轮维度对比）
  const dimensionSets = allRounds.map(r => r.dimensions);
  const convergence = detectConvergence(
    allRounds.map(r => r.result),
    dimensionSets,
    allRounds.map(r => r.scores ? r.scores.scores : [])
  );

  if (convergence.converged) {
    console.log(`  🔒 收敛检测: ${convergence.reasons.join(', ')}`);
  }

  // 少数意见
  const allRoundComments = allRounds.map(r => r.comments);
  const minorityOpinions = extractMinorityOpinions(allRoundComments);

  // IssueTracker 最终摘要
  const issueSummary = issueTracker.getSummary();

  // 生成报告
  const reportMd = generateReport(project, allRounds, config, stoppedReason, minorityOpinions, issueSummary);

  const outputDir = resolve(projectRoot, 'papers', project, 'output');
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  const reportPath = resolve(outputDir, 'iterative-review-report.md');
  writeFileSync(reportPath, reportMd, 'utf-8');
  console.log('\n📄 迭代报告已保存: output/iterative-review-report.md');

  return {
    rounds: allRounds.length,
    stoppedReason,
    lastTotal,
    convergence,
    minorityOpinions,
    reportPath,
    perspectives: allRounds.map(r => r.perspective),
  };
}

module.exports = {
  iterativeReview,
  IssueTracker,
  classifySeverity,
  routeBySeverity,
  parseReviewIssues,
  extractScores,
  extractMinorityOpinions,
  getPerspectiveForRound,
  PERSPECTIVES,
  medianScore,
};

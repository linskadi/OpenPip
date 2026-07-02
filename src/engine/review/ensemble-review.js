const { callLLMWithRetry } = require('../llm/llm');
const { AntiSycophancyChecker, FrameLockDetector } = require('./anti-sycophancy');
const { loadYaml } = require('../utils');
const { defaultLogger } = require('../infra/logger');
const { readFileSync, existsSync, readdirSync } = require('fs');
const { resolve: pathResolve } = require('path');

// ============================================================
// 常量定义
// ============================================================

// ensemble 评审配置
const DEFAULT_NUM_REVIEWS = 5;
const DEFAULT_NUM_REFLECTIONS = 5;

// 反阿谀过滤
const FRAME_LOCK_WEIGHT = 2;
const SYCOPHANCY_RISK_THRESHOLD = 3;

// 报告输出
const MAX_ISSUES_IN_REPORT = 5;


// ============================================================
// 审稿人风格定义
// ============================================================
const REVIEWER_STYLES = {
  strict: {
    name: '严格审稿人',
    description: '注重创新性和理论深度，对方法论要求严格',
    focus: ['创新性', '理论深度', '方法论严谨性', '实验设计'],
    severity: 'high',
    prompt: `你是一位严格的审稿人，来自顶级期刊审稿人团队。
重点关注：
1. 创新性：是否提出了新的理论或方法？
2. 理论深度：理论分析是否充分？
3. 方法论：实验设计是否严谨？
4. 数据：实验数据是否充分支持结论？
5. 写作质量：是否符合学术规范？

请给出详细的批评性意见，指出所有不足之处。`,
  },
  lenient: {
    name: '宽松审稿人',
    description: '注重完整性，对创新性要求相对宽松',
    focus: ['完整性', '逻辑性', '可读性', '实用性'],
    severity: 'medium',
    prompt: `你是一位宽松的审稿人，来自应用类期刊审稿人团队。
重点关注：
1. 完整性：论文结构是否完整？
2. 逻辑性：论证是否清晰？
3. 可读性：是否易于理解？
4. 实用性：是否有应用价值？
5. 基本规范：是否符合基本学术规范？

请给出建设性意见，帮助作者改进论文。`,
  },
  method: {
    name: '方法论审稿人',
    description: '专注于研究方法和实验设计',
    focus: ['研究方法', '实验设计', '数据处理', '结果分析'],
    severity: 'high',
    prompt: `你是一位专注于方法论的审稿人，来自方法论期刊审稿人团队。
重点关注：
1. 研究方法：方法选择是否合适？
2. 实验设计：实验方案是否科学？
3. 数据处理：数据分析方法是否正确？
4. 结果解释：结果分析是否合理？
5. 可复现性：研究是否可以复现？

请给出详细的方法论评审意见。`,
  },
  writing: {
    name: '写作审稿人',
    description: '专注于写作质量和学术规范',
    focus: ['写作质量', '学术规范', '格式', '引用'],
    severity: 'medium',
    prompt: `你是一位专注于写作质量的审稿人，来自编辑部审稿人团队。
重点关注：
1. 写作质量：语言表达是否准确？
2. 学术规范：是否符合学术写作规范？
3. 格式：是否符合投稿要求？
4. 引用：参考文献是否规范？
5. 图表：图表质量是否达标？

请给出详细的写作修改意见。`,
  },

  contribution: {
    name: '贡献检验者',
    description: '专注于贡献声明是否清晰、可辩护、有新颖性',
    focus: ['贡献清晰度', '新颖性', '可证伪性', 'scope适当性', 'prior work覆盖'],
    severity: 'high',
    prompt: `你是一位贡献检验者。
  重点关注：
  1. 核心贡献是什么？能否用一句话说清楚？
  2. 这个贡献是否可证伪？什么实验结果会否定它？
  3. 是否有 prior work 已经做了同样的事？
  4. 贡献的 scope 是否适当？
  5. 贡献与实验结果是否匹配？`,
  },

  devil: {
    name: '魔鬼代言人',
    description: '假设论文是错的，寻找最可能的失败方式',
    focus: ['实验漏洞', '替代解释', '选择性报告', '因果推断', '泛化性'],
    severity: 'high',
    prompt: `你是一位魔鬼代言人审稿人。你的任务是假设这篇论文的结论是错的，然后寻找最可能的失败方式。
  重点关注：
  1. 实验设计有没有漏洞？基线是否公平？指标是否 cherry-picked？
  2. 结果有没有替代解释？
  3. 是否有选择性报告？
  4. 因果推断是否成立？
  5. 结论能否泛化？`,
  },

  domain: {
    name: '领域专家',
    description: '从该领域研究者的视角审查',
    focus: ['领域常识', '关键baseline', '术语准确性', '领域惯例', '遗漏的相关工作'],
    severity: 'medium',
    prompt: `你是一位该领域的资深研究者。
  重点关注：
  1. 术语使用是否符合领域惯例？
  2. 是否遗漏了重要的 baseline 或相关工作？
  3. 实验设置是否符合领域标准？
  4. 评估指标是否是该领域公认的？
  5. 有没有让领域专家一眼看出的问题？`,
  },
};

// ============================================================
// 从 reviewer-personas/ 目录加载审稿人画像
// ============================================================
function loadReviewerPersonas(projectRoot = process.cwd()) {
  const personas = {};
  try {
    const { getResolver } = require('../resource-resolver');
    const resolver = getResolver(projectRoot);
    const knowledgeDirs = resolver.resolveKnowledgeDirs();

    // 在所有知识目录层中搜索 reviewer-personas
    for (const knowledgeDir of knowledgeDirs) {
      const personasDir = pathResolve(knowledgeDir, 'reviewer-personas');
      if (!existsSync(personasDir)) continue;
      const files = readdirSync(personasDir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        if (personas[file.replace('.md', '')]) continue; // 低优先级不覆盖
        const content = readFileSync(pathResolve(personasDir, file), 'utf-8');
        const name = file.replace('.md', '');
        const titleMatch = content.match(/^#\s+(.+)/m);
        const focusMatch = content.match(/### 重点关注\n([\s\S]*?)(?=\n###|$)/);
        const styleMatch = content.match(/## 审稿风格\n([\s\S]*?)(?=\n##|$)/);
        const focuses = focusMatch
          ? [...focusMatch[1].matchAll(/- (.+?) \((\d+)%\)/g)].map(m => ({ name: m[1].trim(), weight: parseInt(m[2], 10) }))
          : [];
        personas[name] = {
          name: titleMatch ? titleMatch[1].trim() : name,
          description: styleMatch ? styleMatch[1].trim() : `从 ${file} 加载的审稿人画像`,
          focus: focuses.map(f => f.name),
          prompt: `${styleMatch ? styleMatch[1].trim() : ''}\n\n重点关注：\n${focuses.map(f => `${f.name} (${f.weight}%)`).join('\n')}`,
        };
      }
    }
  } catch (err) {
    defaultLogger.warn('加载 reviewer persona 失败', { error: err.message });
  }
  return personas;
}

// 加载外部 persona 并与内置风格合并
const EXTERNAL_PERSONAS = loadReviewerPersonas();
const ALL_REVIEWER_STYLES = { ...REVIEWER_STYLES, ...EXTERNAL_PERSONAS };

// 解析论文结构
function parsePaperStructure(paperText) {
  const structure = {
    title: '',
    abstract: '',
    keywords: [],
    sections: [],
    references: [],
    figures: [],
    tables: [],
    formulas: [],
  };

  const lines = paperText.split('\n');
  let currentSection = null;
  let currentSubsection = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.match(/^#\s+/)) {
      structure.title = line.replace(/^#+\s*/, '');
    }

    if (line.match(/^(摘要|摘要：|摘要:)/i)) {
      currentSection = 'abstract';
      structure.abstract = '';
    }

    if (line.match(/^(关键词|关键词：|关键词:)/i)) {
      structure.keywords = line.replace(/^(关键词[：:]?\s*)/, '').split(/[,，、]/).map(k => k.trim());
    }

    if (line.match(/^#{2,3}\s+/)) {
      const level = line.match(/^(#+)/)[1].length;
      const title = line.replace(/^#+\s*/, '');

      if (level === 2) {
        currentSection = { title, subsections: [], content: '' };
        structure.sections.push(currentSection);
        currentSubsection = null;
      } else if (level === 3 && currentSection) {
        currentSubsection = { title, content: '' };
        currentSection.subsections.push(currentSubsection);
      }
    }

    if (line.match(/图\s*\d+/)) {
      const figureMatch = line.match(/图\s*(\d+)/g);
      if (figureMatch) {
        structure.figures.push(...figureMatch.map(f => f.replace(/\s/g, '')));
      }
    }

    if (line.match(/表\s*\d+/)) {
      const tableMatch = line.match(/表\s*(\d+)/g);
      if (tableMatch) {
        structure.tables.push(...tableMatch.map(t => t.replace(/\s/g, '')));
      }
    }

    if (line.match(/\(\d+\)/)) {
      const formulaMatch = line.match(/\((\d+)\)/g);
      if (formulaMatch) {
        structure.formulas.push(...formulaMatch.map(f => f.replace(/[()]/g, '')));
      }
    }

    if (line.match(/^\[\d+\]/)) {
      structure.references.push(line);
    }

    if (currentSection && currentSection !== 'abstract') {
      if (currentSubsection) {
        currentSubsection.content += line + '\n';
      } else {
        currentSection.content += line + '\n';
      }
    } else if (currentSection === 'abstract') {
      structure.abstract += line + '\n';
    }
  }

  return structure;
}

// ============================================================
// ensemble: N 路并行评审 + 每路最多 R 次反思 + 多样化风格 + 反阿谀过滤 + 合并
// ============================================================

async function ensembleReview(agent, draft, mode, config, { numReviews = DEFAULT_NUM_REVIEWS, numReflections = DEFAULT_NUM_REFLECTIONS, styles = null, venue = null } = {}) {
  // 多样化风格：默认轮转使用 7 种风格，让 N 路评审视角不同
  const styleKeys = styles || [...Object.keys(REVIEWER_STYLES), ...Object.keys(EXTERNAL_PERSONAS)];

  // 加载 common-pitfalls（Q4 增强）
  let commonPitfalls = '';
  try {
    const { getResolver } = require('../resource-resolver');
    const resolver = getResolver(process.cwd());
    const knowledgeDirs = resolver.resolveKnowledgeDirs();
    for (const dir of knowledgeDirs) {
      const pitfallsPath = pathResolve(dir, 'writing', 'common-pitfalls.md');
      if (existsSync(pitfallsPath)) {
        commonPitfalls = readFileSync(pitfallsPath, 'utf-8');
        break;
      }
    }
  } catch {
    // 加载 common-pitfalls.md 失败，使用默认空内容
  }

  // 加载 venue persona 和审稿权重（如果有）
  let venueHint = '';
  let venueWeights = null;
  if (venue) {
    try {
      const { getResolver } = require('../resource-resolver');
      const resolver = getResolver(process.cwd());
      const venuePath = resolver.resolveVenue(venue);
      if (venuePath) {
        const profile = loadYaml(venuePath, null);
        if (profile) {
          venueHint = `\n\n你代表 ${profile.name || venue} 的审稿人。重点关注：${Object.entries(profile.reviewer_priorities || {}).map(([k, v]) => `${k}(${(v * 100).toFixed(0)}%)`).join('、')}。`;
          if (profile.reviewer_priorities) {
            venueWeights = profile.reviewer_priorities;
          }
        }
      }
    } catch {
      // venue 配置加载失败，使用默认审稿参数
    }
  }

  const basePrompt = (reflection, prev, styleKey) => {
    const style = ALL_REVIEWER_STYLES[styleKey] || ALL_REVIEWER_STYLES.strict;
    const head = `你是 Reviewer Agent（${style.name}）。mode=${mode}。
${style.prompt}${venueHint}

对以下论文输出结构化审稿报告（评分0-100、决策、3-5条意见、完整性附录）。${commonPitfalls ? `\n\n## 已知常见问题（请检查论文是否包含）\n${commonPitfalls}` : ''}`;
    if (reflection > 0 && prev) {
      return `${head}\n\n你上一轮评审如下，请反思是否有遗漏或过严/过松，补充后重新输出：\n<prev>${prev}</prev>\n\n论文：\n${draft}`;
    }
    return `${head}\n\n论文：\n${draft}`;
  };

  // N 路并行（最多 MAX_CONCURRENT 路同时执行），每路分配一种风格（轮转）
  const MAX_CONCURRENT = 5;
  const runWithConcurrency = async (items, fn) => {
    const results = [];
    const queue = items.map((item, i) => ({ item, i }));
    const inFlight = new Set();
    let nextIdx = 0;
    while (nextIdx < queue.length || inFlight.size > 0) {
      while (inFlight.size < MAX_CONCURRENT && nextIdx < queue.length) {
        const { item, i } = queue[nextIdx++];
        const promise = fn(item, i).then(r => { inFlight.delete(promise); return r; });
        inFlight.add(promise);
        results[i] = promise;
      }
      if (inFlight.size > 0) await Promise.race(inFlight);
    }
    return Promise.all(results);
  };
  const reviewRuns = await runWithConcurrency(
    Array.from({ length: numReviews }, (_, i) => ({ styleKey: styleKeys[i % styleKeys.length], i })),
    ({ styleKey }) => runOneReview(agent, (r, prev) => basePrompt(r, prev, styleKey), numReflections, config)
  );

  // 反阿谀过滤：剔除高阿谀/框架锁定的评审，清洗确认语句
  const filtered = filterSycophanticReviews(reviewRuns);

  return mergeReviews(filtered.reviews, { sycophancyReport: filtered.report, venueWeights });
}

// 过滤阿谀评审：用 FrameLockDetector + AntiSycophancyChecker 双层筛查
function filterSycophanticReviews(reviews) {
  const frameDetector = new FrameLockDetector();
  const sycophancyChecker = new AntiSycophancyChecker();
  const report = { total: reviews.length, filtered: 0, reasons: [] };

  // 评分每一路评审
  const scored = reviews.map(text => {
    const frameResult = frameDetector.detectFrameLock(text);
    const sycophancySignals = countSycophancySignals(text, sycophancyChecker);
    const riskScore = (frameResult.locked ? FRAME_LOCK_WEIGHT : 0) + sycophancySignals;
    return {
      text,
      riskScore,
      locked: frameResult.locked,
      sycophancySignals,
      frameworkCount: frameResult.frameworks.length,
      blindSpotCount: frameResult.structuralBlindSpots.length,
    };
  });

  // 剔除高风险评审（riskScore >= 3 视为阿谀污染）
  let kept = scored.filter(s => s.riskScore < SYCOPHANCY_RISK_THRESHOLD);
  report.filtered = scored.length - kept.length;
  for (const s of scored) {
    if (s.riskScore >= SYCOPHANCY_RISK_THRESHOLD) {
      report.reasons.push({
        riskScore: s.riskScore,
        locked: s.locked,
        sycophancySignals: s.sycophancySignals,
        preview: s.text.slice(0, 60),
      });
    }
  }

  // 安全兜底：若全部被过滤则保留风险最低的一个（避免空集）
  if (kept.length === 0 && scored.length > 0) {
    kept = [scored.sort((a, b) => a.riskScore - b.riskScore)[0]];
  }

  // 清洗存活的评审：转换确认语句为批判性表述
  const cleanedTexts = kept.map(s => sycophancyChecker.convertConfirmationStatements(s.text));

  return { reviews: cleanedTexts, report };
}

function countSycophancySignals(text, _checker) {
  let count = 0;
  const signals = [
    /您的观点非常正确/,
    /确实如您所说/,
    /您说得对/,
    /我完全同意/,
    /这是一个很好的观察/,
    /没有问题/,
    /完全正确/,
    /确实是这样/,
  ];
  for (const p of signals) {
    const m = text.match(new RegExp(p, 'g'));
    if (m) count += m.length;
  }
  return count;
}

async function runOneReview(agent, basePrompt, numReflections, config) {
  let prev = null;
  let last = '';
  for (let r = 0; r < numReflections; r++) {
    last = await callLLMWithRetry(agent.model, basePrompt(r, prev), config);
    // 简单收敛：若反思未变化则提前停
    if (r > 0 && last === prev) break;
    prev = last;
  }
  return last;
}

function mergeReviews(reviews, options = {}) {
  // 提取每路分数
  const scores = reviews
    .map(r => {
      const m = r.match(/(\d+)\s*\/\s*100/);
      return m ? parseInt(m[1], 10) : null;
    })
    .filter(s => s !== null)
    .sort((a, b) => a - b);

  const median = scores.length > 0 ? scores[Math.floor(scores.length / 2)] : null;

  // 决策取多数
  const decisions = reviews.map(r => {
    if (/Accept/i.test(r)) return 'Accept';
    if (/Minor/i.test(r)) return 'Minor';
    if (/Major/i.test(r)) return 'Major';
    if (/Reject/i.test(r)) return 'Reject';
    return 'Major';
  });
  const decision = modeOf(decisions);

  // 意见合并：去重（按"位置"粗略去重），支持多种格式
  const seen = new Set();
  const issues = [];
  const ISSUE_PATTERNS = [
    { regex: /### 意见\d+[^\n]*\n([\s\S]*?)(?=### 意见|## \d|### Issue|\*\*意见|$)/g, extract: m => m[0] },
    { regex: /### Issue \d+[^\n]*\n([\s\S]*?)(?=### Issue|### 意见|## \d|$)/gi, extract: m => m[0] },
    { regex: /## \d+\.\s+[^\n]+\n([\s\S]*?)(?=## \d+\.|### |$)/g, extract: m => m[0] },
    { regex: /\*\*意见\d+\*\*[^\n]*\n([\s\S]*?)(?=\*\*意见|### |## |$)/g, extract: m => m[0] },
  ];
  for (const r of reviews) {
    let matched = false;
    for (const { regex, extract } of ISSUE_PATTERNS) {
      const matches = r.matchAll(new RegExp(regex.source, regex.flags));
      let count = 0;
      for (const m of matches) {
        const text = extract(m);
        const loc = (text.match(/\*\*位置\*\*[:：]\s*(.+)/) || [])[1] || text.slice(0, 40);
        if (seen.has(loc)) continue;
        seen.add(loc);
        issues.push(text.trim());
        count++;
      }
      if (count > 0) { matched = true; break; }
    }
    if (!matched) {
      // 降级：提取所有带编号的段落
      const fallbackRe = new RegExp('(?:^|\\n)(?:\\d+[.:)]\\s*|\\*\\*\\d+\\*\\*\\s*)([\\s\\S]*?)(?=(?:\\n\\d+[.:)]|\\n\\*\\*\\d+\\*\\*|$))', 'g');
      const fallbackMatches = r.matchAll(fallbackRe);
      for (const m of fallbackMatches) {
        const text = m[0].trim();
        if (text.length < 10) continue;
        const loc = text.slice(0, 40);
        if (seen.has(loc)) continue;
        seen.add(loc);
        issues.push(text);
      }
    }
  }

  const result = {
    score: median,
    decision,
    issues: issues.slice(0, MAX_ISSUES_IN_REPORT),
    raw: reviews,
  };

  // 附带反阿谀过滤报告
  if (options.sycophancyReport) {
    result.sycophancyFilter = options.sycophancyReport;
  }

  if (options.venueWeights) {
    result.venueWeights = options.venueWeights;
  }

  return result;
}

function modeOf(arr) {
  const counts = {};
  for (const v of arr) counts[v] = (counts[v] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

// ============================================================
// 单风格审稿
// ============================================================

module.exports = {
  ensembleReview,
  REVIEWER_STYLES,
  parsePaperStructure,
};


// 反阿谀机制（Anti-Sycophancy Checker）
// 无外部依赖，纯 Node.js 实现

// 默认让步阈值：反驳评分达到此值则视为采纳反驳
const DEFAULT_CONCESSION_THRESHOLD = 4;
// 默认连续确认限制：连续确认次数达到此值则触发质疑
const DEFAULT_STREAK_LIMIT = 3;

class AntiSycophancyChecker {
  constructor(options = {}) {
    this.concessionThreshold = options.concessionThreshold || DEFAULT_CONCESSION_THRESHOLD;
    this.streakLimit = options.streakLimit || DEFAULT_STREAK_LIMIT;
    this.history = [];
  }

  // 评估反驳是否合理（Concession Threshold）
  // rebuttal: 反驳文本
  // originalAttack: 原始攻击/质疑文本
  // 返回: { score, conceded, reasoning }
  evaluateConcession(rebuttal, originalAttack) {
    const score = this.scoreRebuttal(rebuttal, originalAttack);
    const conceded = score >= this.concessionThreshold;

    const record = {
      timestamp: Date.now(),
      originalAttack,
      rebuttal,
      score,
      conceded,
    };
    this.history.push(record);

    return {
      score,
      conceded,
      reasoning: conceded
        ? `反驳评分 ${score} ≥ 让步阈值 ${this.concessionThreshold}，采纳反驳`
        : `反驳评分 ${score} < 让步阈值 ${this.concessionThreshold}，坚持原始攻击`,
    };
  }

  // 评分反驳质量（1-5 分）
  scoreRebuttal(rebuttal, originalAttack) {
    let score = 3; // 基础分

    // 1. 反驳是否提供了具体证据
    const evidencePatterns = [
      /(?:数据|实验|结果|文献|研究表明|引用)/,
      /\d+(?:\.\d+)?%/,
      /(?:表|图|公式)\s*\d/,
      /(?:在|于)\s*\w+\s*(?:上|中|下)/,
    ];
    const hasEvidence = evidencePatterns.some(p => p.test(rebuttal));
    if (hasEvidence) score += 1;

    // 2. 反驳是否直接回应了原始攻击
    const attackWords = originalAttack.split(/[\s，,。.、]/).filter(w => w.length >= 2);
    let relevanceCount = 0;
    for (const word of attackWords) {
      if (rebuttal.includes(word)) relevanceCount++;
    }
    const relevance = attackWords.length > 0 ? relevanceCount / attackWords.length : 0;
    if (relevance > 0.3) score += 1;

    // 3. 阿谀信号检测（降低分）
    const sycophancySignals = [
      /您的观点非常正确/,
      /确实如您所说/,
      /您说得对/,
      /我完全同意/,
      /这是一个很好的观察/,
    ];
    for (const pattern of sycophancySignals) {
      if (pattern.test(rebuttal)) {
        score = Math.max(1, score - 2);
        break;
      }
    }

    // 4. 纯附和词（"嗯"、"对"、"是"）过多则降分
    const agreeWords = rebuttal.match(/(?:嗯|对|是|确实|当然|没错|同意)/g);
    if (agreeWords && agreeWords.length > 3) {
      score = Math.max(1, score - 1);
    }

    return Math.max(1, Math.min(5, score));
  }

  // 连续确认检测
  // history: 之前的评审历史（数组，元素为 { text, isConfirmation }）
  // 返回: { streak, shouldChallenge, challengeQuestions }
  detectConsecutiveConfirmations(history) {
    const fullHistory = history || this.history;
    if (fullHistory.length === 0) {
      return { streak: 0, shouldChallenge: false, challengeQuestions: [] };
    }

    // 从末尾向前统计连续确认
    let streak = 0;
    for (let i = fullHistory.length - 1; i >= 0; i--) {
      const entry = fullHistory[i];
      const isConfirmation = entry.conceded === true ||
        this.isConfirmationText(entry.rebuttal || entry.text || '');
      if (isConfirmation) {
        streak++;
      } else {
        break;
      }
    }

    const shouldChallenge = streak >= this.streakLimit;
    const challengeQuestions = shouldChallenge
      ? this.generateChallengeQuestions(fullHistory)
      : [];

    return { streak, shouldChallenge, challengeQuestions };
  }

  isConfirmationText(text) {
    const confirmPatterns = [
      /您说得对/,
      /确实如此/,
      /我同意/,
      /没有问题/,
      /完全正确/,
      /确实是这样/,
    ];
    return confirmPatterns.some(p => p.test(text));
  }

  // 生成挑战性问题
  generateChallengeQuestions(context) {
    const questions = [
      '是否存在与当前结论相矛盾的反例？',
      '如果核心假设不成立，结论是否仍然有效？',
      '当前方法的局限性是否被充分讨论？',
      '与最接近的竞品方法相比，差异化优势是否经过严格验证？',
      '实验结果是否存在选择性报告的风险？',
      '样本量是否足以支撑统计显著性结论？',
      '是否存在未控制的混淆变量影响实验结果？',
    ];

    // 根据上下文选择最相关的问题
    const selected = [];
    const contextText = JSON.stringify(context).toLowerCase();

    const relevanceMap = [
      { keywords: ['方法', '算法', '模型'], question: '当前方法的局限性是否被充分讨论？' },
      { keywords: ['实验', '数据', '结果'], question: '实验结果是否存在选择性报告的风险？' },
      { keywords: ['创新', '贡献', '优势'], question: '与最接近的竞品方法相比，差异化优势是否经过严格验证？' },
      { keywords: ['结论', '表明', '证明'], question: '如果核心假设不成立，结论是否仍然有效？' },
    ];

    for (const { keywords, question } of relevanceMap) {
      if (keywords.some(k => contextText.includes(k))) {
        selected.push(question);
      }
    }

    // 补充通用问题直到 3 个
    for (const q of questions) {
      if (selected.length >= 3) break;
      if (!selected.includes(q)) selected.push(q);
    }

    return selected.slice(0, 3);
  }

  // 三层防御：自动转换确认语句
  convertConfirmationStatements(text) {
    const conversions = [
      {
        pattern: /您说得非常正确，(.+)/,
        replacement: '经过验证，$1。然而需要考虑是否存在反例。',
      },
      {
        pattern: /确实如您所说，(.+)/,
        replacement: '$1。但该结论是否在所有条件下成立尚需进一步验证。',
      },
      {
        pattern: /这是一个很好的观点，(.+)/,
        replacement: '$1。需要注意的是，该观点可能存在适用边界。',
      },
      {
        pattern: /我完全同意您的看法，(.+)/,
        replacement: '现有证据支持：$1。但仍需考虑替代解释。',
      },
    ];

    let result = text;
    for (const { pattern, replacement } of conversions) {
      result = result.replace(pattern, replacement);
    }

    return result;
  }
}

// FrameLockDetector：检测 AI 生成内容的认知框架锁定
class FrameLockDetector extends AntiSycophancyChecker {
  constructor(options = {}) {
    super(options);
    this.knownFrameworks = options.knownFrameworks || this.getDefaultFrameworks();
  }

  getDefaultFrameworks() {
    return [
      {
        name: '因果框架',
        patterns: [/因为.*所以/, /由于.*导致/, /.*的原因是/],
        blindSpot: '忽略了相关性≠因果性',
      },
      {
        name: '线性外推框架',
        patterns: [/越来越多/, /趋势表明/, /可以预见/],
        blindSpot: '假设趋势线性延续，忽略非线性和拐点',
      },
      {
        name: '二元对立框架',
        patterns: [/要么.*要么/, /不是.*就是/, /要么A要么B/],
        blindSpot: '忽略多值可能性和灰度空间',
      },
      {
        name: '权威引用框架',
        patterns: [/根据.*研究表明/, /已有文献证明/, /权威结论指出/],
        blindSpot: '过度依赖已有权威，忽略范式转变可能',
      },
      {
        name: '技术乐观框架',
        patterns: [/随着.*发展/, /未来将/, /可以实现/],
        blindSpot: '低估技术实现的困难和时间',
      },
    ];
  }

  // 检测文本中的认知框架锁定
  detectFrameLock(text) {
    const detected = [];

    for (const framework of this.knownFrameworks) {
      const matches = [];
      for (const pattern of framework.patterns) {
        const found = text.match(new RegExp(pattern, 'g'));
        if (found) matches.push(...found);
      }
      if (matches.length > 0) {
        detected.push({
          framework: framework.name,
          blindSpot: framework.blindSpot,
          instances: matches,
          frequency: matches.length,
        });
      }
    }

    // 检测 AI 共享认知框架的结构性盲点
    const structuralBlindSpots = this.detectStructuralBlindSpots(text);

    return {
      locked: detected.length >= 2,
      frameworks: detected,
      structuralBlindSpots,
      recommendation: detected.length >= 2
        ? `检测到 ${detected.length} 种认知框架锁定。建议：引入替代视角、构造反例、验证边界条件。`
        : '认知框架多样性尚可。',
    };
  }

  // 检测结构性盲点
  detectStructuralBlindSpots(text) {
    const blindSpots = [];

    // 1. 选择性引用
    const citations = text.match(/\[\d+\]/g) || [];
    if (citations.length > 5) {
      const uniqueCitations = new Set(citations);
      if (uniqueCitations.size < citations.length * 0.7) {
        blindSpots.push({
          type: 'citation_concentration',
          description: '引用集中于少数文献，可能存在选择性引用',
        });
      }
    }

    // 2. 单一方法论倾向
    const methodPatterns = [
      /(?:采用|使用|基于|利用)\s*(\S+?)(?:方法|算法|技术|模型)/g,
    ];
    const methods = new Set();
    for (const pattern of methodPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        methods.add(match[1]);
      }
    }
    if (methods.size <= 1 && text.length > 1000) {
      blindSpots.push({
        type: 'methodological_monoculture',
        description: '论文仅依赖单一方法论，缺乏交叉验证',
      });
    }

    // 3. 结果单一方向性
    const positiveResults = (text.match(/(?:提升|改进|优于|高于|显著|有效)/g) || []).length;
    const negativeResults = (text.match(/(?:不足|局限|低于|失败|挑战|困难)/g) || []).length;
    if (positiveResults > 0 && negativeResults === 0 && text.length > 500) {
      blindSpots.push({
        type: 'result_bias',
        description: '所有结果均为正面，可能存在报告偏差',
      });
    }

    // 4. AI 共享认知框架特征
    const aiSharedPatterns = [
      { pattern: /值得注意的是/, blind: '过度使用填充短语，回避直接论证' },
      { pattern: /总而言之/, blind: '结论段缺乏新信息，仅为重复' },
      { pattern: /具有重要意义/, blind: '夸大重要性而缺乏具体支撑' },
      { pattern: /引发了广泛关注/, blind: '假设共识而非提供证据' },
    ];

    for (const { pattern, blind } of aiSharedPatterns) {
      if (pattern.test(text)) {
        blindSpots.push({
          type: 'ai_shared_cognition',
          description: `AI 共享认知框架: ${blind}`,
          pattern: pattern.source,
        });
      }
    }

    return blindSpots;
  }
}

module.exports = { AntiSycophancyChecker, FrameLockDetector };

const { formatReport } = require('./report-formatter');

function extractPromises(introductionText) {
  const promises = [];
  const patterns = [
    /(?:本文|本研究|我们)\s*(?:提出|旨在|目标是|致力于)\s*(.+?)(?:[。；\n])/g,
    /(?:主要贡献|创新点|贡献)[包括是：:]*\s*(.+?)(?:[。；\n])/g,
    /(?:与|和|同)\s*(?:现有|已有|传统|以往)\s*.{0,10}(?:不同|区别|差异)\s*[，,：:]*\s*(.+?)(?:[。；\n])/g,
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(introductionText)) !== null) {
      promises.push({
        text: match[1]?.trim() || match[0].trim(),
        position: match.index,
        source: 'introduction',
      });
    }
  }

  return promises;
}

function checkPromiseDelivery(promises, methodText, experimentText, conclusionText) {
  const results = [];
  for (const promise of promises) {
    // 从承诺文本中提取关键词（去除常见停用词，保留实词）
    const keywords = extractKeywords(promise.text);

    // 方法章节是否描述了对应的实现（关键词命中）
    const deliveredInMethod = methodText && keywords.length > 0
      ? keywords.some(kw => methodText.includes(kw))
      : !!(methodText && methodText.trim());

    // 实验章节是否给出量化结果（数值/百分比/对比指标）
    const deliveredInExperiment = experimentText
      && /\d+\.?\d*\s*%/.test(experimentText)
      && (keywords.length === 0 || keywords.some(kw => experimentText.includes(kw)));

    // 结论章节是否回呼了承诺（关键词命中）
    const mentionedInConclusion = conclusionText
      && keywords.length > 0
      && keywords.some(kw => conclusionText.includes(kw));

    results.push({
      promise: promise.text,
      delivered: deliveredInMethod && deliveredInExperiment,
      verified: deliveredInExperiment,
      mentioned: mentionedInConclusion,
    });
  }
  return results;
}

// 从承诺句子中提取实词关键词（长度≥2 的中文词或英文单词）
function extractKeywords(text) {
  if (!text) return [];
  // 去除标点和常见引导词
  const cleaned = text.replace(/[，。；：、""''（）()[\]【】]/g, ' ');
  const STOP_WORDS = new Set([
    '本文', '本研究', '我们', '提出', '旨在', '目标是', '致力于',
    '主要', '贡献', '创新点', '包括', '是', '有', '和', '与', '及',
    '的', '了', '在', '为', '对', '从', '通过', '基于', '利用',
    'this', 'the', 'a', 'an', 'we', 'our', 'is', 'are', 'to', 'of', 'and', 'in', 'for',
  ]);
  const tokens = cleaned.split(/[\s,，。；：、]+/).filter(t => t.length >= 2 && !STOP_WORDS.has(t.toLowerCase()));
  // 去重并最多取前 8 个关键词，避免过度匹配
  return [...new Set(tokens)].slice(0, 8);
}

function generateReport(promiseResults) {
  const delivered = promiseResults.filter(r => r.delivered);
  const undelivered = promiseResults.filter(r => !r.delivered);

  return formatReport({
    title: '承诺-交付追踪报告',
    summary: [
      `总承诺数: ${promiseResults.length}`,
      `✅ 已交付: ${delivered.length}`,
      `❌ 未交付: ${undelivered.length}`,
    ],
    groups: undelivered.length > 0
      ? [{
        title: '未交付的承诺',
        severity: 'high',
        issues: undelivered.map(r => ({ message: `"${r.promise.slice(0, 60)}"` })),
      }]
      : [],
  });
}

module.exports = { extractPromises, checkPromiseDelivery, generateReport };

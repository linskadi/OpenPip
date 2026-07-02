const { findOverClaims } = require('./over-claim-patterns');

function selfCritiqueChapter(chapterDraft, contributionClaim, _chapterOutline) {
  const issues = [];

  // 1. 检查字数
  const wordCount = chapterDraft.length;
  if (wordCount < 500) issues.push('章节字数过少（< 500 字），需要扩充内容');
  if (wordCount > 8000) issues.push('章节字数过多（> 8000 字），建议拆分');

  // 2. 检查 over-claiming 关键词（中英文一并检测）
  const cnOverClaims = findOverClaims(chapterDraft, 'cn');
  for (const m of cnOverClaims) {
    issues.push(`可能的 over-claiming: 检测到 "${m.pattern}"，请确认有充分的实验/引用支撑`);
  }
  const enOverClaims = findOverClaims(chapterDraft, 'en');
  for (const m of enOverClaims) {
    issues.push(`可能的 over-claiming: 检测到 "${m.pattern}"，请确认有充分的实验/引用支撑`);
  }

  // 3. 检查引用不足
  const refCount = (chapterDraft.match(/\[\d+\]/g) || []).length;
  if (refCount < 2) issues.push(`引用偏少（${refCount} 篇），建议增加到 2 篇以上`);

  // 4. 检查与 contribution 的对齐
  if (contributionClaim) {
    const claimStr = typeof contributionClaim === 'string' ? contributionClaim : JSON.stringify(contributionClaim);
    const keywords = claimStr.match(/[\u4e00-\u9fff\w]{2,}/g) || [];
    let matchCount = 0;
    for (const kw of keywords.slice(0, 10)) {
      if (chapterDraft.includes(kw)) matchCount++;
    }
    if (matchCount < 2) {
      issues.push('本章内容可能与核心贡献关联不足，建议增加与 contribution 的呼应');
    }
  }

  return {
    needsRevision: issues.length > 0,
    issues,
    wordCount,
    refCount,
  };
}

function getLastParagraphs(text, n = 2) {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  return paragraphs.slice(-n).join('\n\n');
}

module.exports = { selfCritiqueChapter, getLastParagraphs };

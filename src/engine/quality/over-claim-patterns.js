const OVER_CLAIM_PATTERNS_CN = [
  /首次(?:提出|发现|实现|采用|使用|证明)/gi,
  /唯一(?:的|一种|方法|途径)/gi,
  /最佳(?:的|方法|方案|策略)/gi,
  /最优(?:的|解|方案)/gi,
  /最(?:大|小)的(?:提升|改进|降低)/gi,
  /所有(?:的|现有|方法|研究)/gi,
  /完全(?:解决|消除|避免|覆盖)/gi,
  /彻底(?:解决|消除|改变)/gi,
  /突破性/gi,
  /显著.*提升/gi,
];

const OVER_CLAIM_PATTERNS_EN = [
  /\b(significantly|dramatically|extremely|remarkably)\s+better\b/gi,
  /\b(state-of-the-art|SOTA)\b.*?(without|no)\s+(comparison|baseline)/gi,
  /\b(first|novel|pioneering)\b(?![^.]*?(?:to the best|as far as|to our knowledge))/gi,
];

function findOverClaims(text, lang = 'cn') {
  const patterns = lang === 'cn' ? OVER_CLAIM_PATTERNS_CN : OVER_CLAIM_PATTERNS_EN;
  const results = [];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      results.push({
        pattern: match[0],
        index: match.index,
      });
    }
  }
  return results;
}

module.exports = {
  findOverClaims,
};

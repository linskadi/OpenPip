const CLAIM_PATTERNS = [
  /(?:本文|本研究|我们)\s*(?:提出|设计|开发|实现|构建|开发了|提出了)\s*[，,：:]*\s*(.+)/g,
  /(?:实验结果|研究结果|结果)\s*(?:表明|显示|证明|证实|说明)\s*[，,：:]*\s*(.+)/g,
  /(?:方法|算法|模型|框架|系统|方案)\s*(?:在|能够|可以|能够有效)\s*(.+)/g,
  /(?:显著|明显|大幅|有效)\s*(?:提升|提高|改善|降低|减少)\s*(.+)/g,
  /(?:优于|超过|胜过|好于)\s*(?:现有|当前|传统|基准|基线)\s*(.+)/g,
];

function extractClaims(text) {
  const claims = [];
  const seen = new Set();

  for (const pattern of CLAIM_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const fullMatch = match[0];
      const context = text.slice(Math.max(0, match.index - 60), Math.min(text.length, match.index + match[0].length + 60)).replace(/\n/g, ' ');
      if (!seen.has(fullMatch)) {
        seen.add(fullMatch);
        claims.push({ text: fullMatch, context: `...${context}...`, position: match.index });
      }
    }
  }

  return claims;
}

module.exports = { extractClaims };

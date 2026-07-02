function checkFigureTableContinuity(text) {
  const issues = [];
  const figureNums = [...text.matchAll(/Fig(?:ure|\.)\s*(\d+)/gi)].map(m => parseInt(m[1]));
  const tableNums = [...text.matchAll(/Table\s*(\d+)/gi)].map(m => parseInt(m[1]));

  if (figureNums.length > 0) {
    const max = Math.max(...figureNums);
    for (let i = 1; i <= max; i++) {
      if (!figureNums.includes(i)) issues.push(`图号跳号: 缺少 Figure ${i}`);
    }
  }
  if (tableNums.length > 0) {
    const max = Math.max(...tableNums);
    for (let i = 1; i <= max; i++) {
      if (!tableNums.includes(i)) issues.push(`表号跳号: 缺少 Table ${i}`);
    }
  }
  return issues;
}

function checkReferenceCompleteness(text) {
  const issues = [];
  const figureRefs = [...text.matchAll(/Fig(?:ure|\.)\s*(\d+)/gi)].map(m => `Figure ${m[1]}`);
  const tableRefs = [...text.matchAll(/Table\s*(\d+)/gi)].map(m => `Table ${m[1]}`);
  const allRefs = [...new Set([...figureRefs, ...tableRefs])];

  for (const ref of allRefs) {
    const pattern = new RegExp(ref.replace(' ', '\\s+'), 'gi');
    const matches = text.match(pattern) || [];
    if (matches.length < 2) {
      issues.push(`${ref} 可能未在正文中被引用（仅出现 ${matches.length} 次）`);
    }
  }
  return issues;
}

function checkVariableConflicts(text) {
  const issues = [];
  const varDefs = new Map();
  const varPattern = /\$([A-Za-z_]\w*)\$/g;
  let match;
  while ((match = varPattern.exec(text)) !== null) {
    const varName = match[1];
    const lowerName = varName.toLowerCase();
    const existing = varDefs.get(lowerName);
    if (existing && existing.name !== varName) {
      issues.push(`变量名大小写冲突: ${existing.name} 与 ${varName}`);
    }
    if (!varDefs.has(lowerName)) {
      varDefs.set(lowerName, { name: varName, indices: [] });
    }
    varDefs.get(lowerName).indices.push(match.index);
  }
  return issues;
}

function runConsistencyCheck(text) {
  const issues = [
    ...checkFigureTableContinuity(text),
    ...checkReferenceCompleteness(text),
    ...checkVariableConflicts(text),
  ];
  return { issues, pass: issues.length === 0, issueCount: issues.length };
}

module.exports = { runConsistencyCheck, checkFigureTableContinuity, checkReferenceCompleteness };

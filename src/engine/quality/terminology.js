const { readFileSync, existsSync, readdirSync, statSync } = require('fs');
const { resolve, join } = require('path');

let cachedTerms = null;
let cacheKey = null;

function loadTerminology(projectRoot) {
  const knowledgeDir = resolve(projectRoot, '.openpip', 'knowledge');
  const terminologyDir = resolve(knowledgeDir, 'terminology');
  const terminologyFile = resolve(knowledgeDir, 'terminology.md');

  const terms = [];

  if (existsSync(terminologyDir) && statSync(terminologyDir).isDirectory()) {
    const files = readdirSync(terminologyDir).filter(f => 
      f.endsWith('.md') || f.endsWith('.yaml') || f.endsWith('.yml')
    );
    for (const file of files) {
      const filePath = join(terminologyDir, file);
      const content = readFileSync(filePath, 'utf-8');
      const extracted = parseTerminologyContent(content);
      terms.push(...extracted);
    }
  }

  if (existsSync(terminologyFile)) {
    const content = readFileSync(terminologyFile, 'utf-8');
    const extracted = parseTerminologyContent(content);
    terms.push(...extracted);
  }

  const uniquePairs = [];
  const seen = new Set();
  for (const pair of terms) {
    const key = pair[0] + '|' + pair[1];
    if (!seen.has(key)) {
      seen.add(key);
      uniquePairs.push(pair);
    }
  }

  return uniquePairs;
}

function parseTerminologyContent(content) {
  const pairs = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('##')) continue;

    const pattern = /([^(\s（]+)\s*[（(]\s*([^)）]+)\s*[)）]/g;
    let match;
    while ((match = pattern.exec(trimmed)) !== null) {
      const chinese = match[1].trim();
      const english = match[2].trim();
      if (chinese && english && chinese.length >= 2 && english.length >= 2) {
        pairs.push([chinese, english]);
      }
    }
  }

  return pairs;
}

function getTerminology(projectRoot) {
  const key = projectRoot;
  if (cachedTerms && cacheKey === key) {
    return cachedTerms;
  }
  cachedTerms = loadTerminology(projectRoot);
  cacheKey = key;
  return cachedTerms;
}

function checkTerminologyConsistency(text, projectRoot) {
  const terms = getTerminology(projectRoot || process.cwd());
  const issues = [];

  if (terms.length === 0) {
    return { score: 100, pass: true, issues: ['未找到术语表，跳过术语一致性检查'] };
  }

  for (const [chinese, english] of terms) {
    if (text.includes(chinese) && text.includes(english)) {
      issues.push(`术语混用: ${chinese} vs ${english}`);
    }
  }

  const score = issues.length === 0 ? 100 : Math.max(0, 100 - issues.length * 15);
  return { score, pass: issues.length === 0, issues };
}

module.exports = {
  checkTerminologyConsistency,
};

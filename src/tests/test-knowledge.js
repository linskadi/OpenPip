// 测试 knowledge 模块
const { loadKnowledge, loadAllKnowledge } = require('../engine/knowledge/knowledge');
const { resolve } = require('path');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log(`  PASS: ${msg}`); }
  else { failed++; console.log(`  FAIL: ${msg}`); }
}

const knowledgeDir = resolve(__dirname, '..', '..', '.openpip', 'knowledge');

// ── loadKnowledge with known paths ──
console.log('=== loadKnowledge ===');
const content1 = loadKnowledge(['terminology.md'], knowledgeDir);
assert(typeof content1 === 'string', 'loadKnowledge returns string');
assert(content1.length > 0, `loadKnowledge returns content (${content1.length} chars)`);
assert(content1.includes('terminology.md'), 'content includes filename marker');
assert(content1.includes('有限元'), 'terminology.md contains expected content');

// ── loadKnowledge with non-existent file ──
const content2 = loadKnowledge(['nonexistent.md'], knowledgeDir);
assert(content2 === '', 'non-existent file returns empty string');

// ── loadKnowledge with multiple files ──
const content3 = loadKnowledge(['terminology.md', 'fallacies.md'], knowledgeDir);
assert(content3.includes('terminology.md'), 'multi-load includes terminology');
assert(content3.includes('fallacies.md'), 'multi-load includes fallacies');

// ── loadAllKnowledge ──
console.log('\n=== loadAllKnowledge ===');
const allContent = loadAllKnowledge(knowledgeDir);
assert(typeof allContent === 'string', 'loadAllKnowledge returns string');
assert(allContent.length > 0, `loadAllKnowledge returns content (${allContent.length} chars)`);
assert(allContent.includes('terminology'), 'all knowledge includes terminology');
assert(allContent.includes('fallacies'), 'all knowledge includes fallacies');
assert(allContent.includes('statistical-tests'), 'all knowledge includes statistical-tests');

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);

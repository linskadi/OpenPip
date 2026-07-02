// 测试 quality-check 模块
const {
  qualityCheck,
  checkForbiddenWords,
  checkTerminologyConsistency,
  checkFormulaNumbering,
  checkWordCount,
  registerMetric,
  getMetric,
  getAllMetrics,
  unregisterMetric,
} = require('../engine/quality/quality-check');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log(`  PASS: ${msg}`); }
  else { failed++; console.log(`  FAIL: ${msg}`); }
}

// ── checkForbiddenWords ──
console.log('=== checkForbiddenWords ===');
const cleanResult = checkForbiddenWords('本文提出了一种新的方法用于故障诊断。');
assert(cleanResult.score === 100, `clean text score=100 (got ${cleanResult.score})`);
assert(cleanResult.pass === true, 'clean text pass=true');
assert(cleanResult.issues.length === 0, 'clean text no issues');

const dirtyResult = checkForbiddenWords('本文提出了一种非常非常好的方法');
assert(dirtyResult.score < 100, `dirty text score<100 (got ${dirtyResult.score})`);
assert(dirtyResult.pass === false, 'dirty text pass=false');
assert(dirtyResult.issues.length > 0, 'dirty text has issues');

// ── checkFormulaNumbering ──
console.log('\n=== checkFormulaNumbering ===');
const goodFormula = '如式 \\label{eq:1-1} 和 \\label{eq:1-2} 所示';
const r1 = checkFormulaNumbering(goodFormula);
assert(r1.score === 100, `sequential numbering score=100 (got ${r1.score})`);
assert(r1.pass === true, 'sequential numbering pass=true');

const badFormula = '如式 \\label{eq:1-1} 和 \\label{eq:1-3} 所示';
const r2 = checkFormulaNumbering(badFormula);
assert(r2.score < 100, `gap numbering score<100 (got ${r2.score})`);
assert(r2.pass === false, 'gap numbering pass=false');
assert(r2.issues.length > 0, 'gap numbering has issues');

// ── checkTerminologyConsistency ──
console.log('\n=== checkTerminologyConsistency ===');
const consistent = '本文使用有限元分析方法进行计算。';
const r3 = checkTerminologyConsistency(consistent);
assert(r3.score === 100, `consistent score=100 (got ${r3.score})`);
assert(r3.pass === true, 'consistent pass=true');

const inconsistent = '本文使用有限元分析和FEA方法进行计算。';
const r4 = checkTerminologyConsistency(inconsistent);
assert(r4.score < 100, `mixed terminology score<100 (got ${r4.score})`);
assert(r4.pass === false, 'mixed terminology pass=false');

// ── checkWordCount ──
console.log('\n=== checkWordCount ===');
const longText = '这是一段测试文本。'.repeat(200);
const r5 = checkWordCount(longText, 500);
assert(r5.pass === true, `long text meets min words (got ${r5.count})`);

const shortText = '太短了';
const r6 = checkWordCount(shortText, 500);
assert(r6.pass === false, 'short text fails min words');

// ── qualityCheck ──
console.log('\n=== qualityCheck ===');
const sampleDraft = '本文提出了一种基于深度学习的故障诊断方法。实验结果表明，该方法在数据集A上的准确率达到95.2%，比传统方法提高2.3%。该方法利用注意力机制自动提取关键特征。'.repeat(20);
const result = qualityCheck(sampleDraft);
assert(typeof result.pass === 'boolean', `qualityCheck returns pass (got ${typeof result.pass})`);
assert(typeof result.compositeScore === 'number', `qualityCheck returns compositeScore (got ${typeof result.compositeScore})`);
assert(typeof result.results === 'object', 'qualityCheck returns results object');
assert(Object.keys(result.results).length > 0, `qualityCheck has results (${Object.keys(result.results).length} metrics)`);

// ── metric registry ──
console.log('\n=== metricRegistry ===');
const allMetrics = getAllMetrics();
assert(allMetrics.length > 0, `getAllMetrics returns ${allMetrics.length} metrics`);
assert(getMetric('forbidden_words') !== undefined, 'getMetric("forbidden_words") exists');

registerMetric('test_custom', () => ({ score: 42, pass: true, issues: [] }), 0.5);
assert(getMetric('test_custom') !== undefined, 'custom metric registered');
unregisterMetric('test_custom');
assert(getMetric('test_custom') === undefined, 'custom metric unregistered');

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);

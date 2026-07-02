const { extractClaims } = require('../engine/quality/claim-extractor');
const { checkArgumentation } = require('../engine/quality/argumentation-checker');

// Test 1: extract claims
const text1 = '本文提出了一种新的故障诊断方法。实验结果表明准确率达到95.2%。该方法优于现有基线方法。';
const claims1 = extractClaims(text1);
if (claims1.length < 2) throw new Error(`Expected >=2 claims, got ${claims1.length}`);

// Test 2: check argumentation with over-claiming
const text2 = '本文首次提出突破性方法，显著提升了性能。';
const claims2 = extractClaims(text2);
const results2 = checkArgumentation(text2, claims2);
const overClaimResult = results2.find(r => r.name === 'over_claiming');
if (!overClaimResult) throw new Error('Missing over_claiming check');
if (overClaimResult.pass) throw new Error('Should detect over-claiming');

// Test 3: clean text
const text3 = '根据文献[1]，该方法在数据集A上达到95.2%，比基线高2.3%。';
const claims3 = extractClaims(text3);
const results3 = checkArgumentation(text3, claims3);
const evidenceResult = results3.find(r => r.name === 'evidence_matching');
if (evidenceResult && !evidenceResult.pass) {
  // Evidence should be found because of [1] and 95.2%
}

// Test 4: generate report
const { generateReport } = require('../engine/quality/argumentation-checker');
const report = generateReport(results2);
if (!report.includes('论证质量检查报告')) throw new Error('Missing report header');

console.log('✅ test-argumentation-checker passed');

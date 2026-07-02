// 测试 budgetTracker (llm.js)
const { budgetTracker } = require('../engine/llm');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log(`  PASS: ${msg}`); }
  else { failed++; console.log(`  FAIL: ${msg}`); }
}

// ── reset ──
console.log('=== budgetTracker.reset ===');
budgetTracker.reset(1.0);
assert(budgetTracker.totalTokens === 0, 'totalTokens reset to 0');
assert(budgetTracker.totalCost === 0, 'totalCost reset to 0');
assert(budgetTracker.budgetLimit === 1.0, 'budgetLimit set to 1.0');

// ── record ──
console.log('\n=== budgetTracker.record ===');
budgetTracker.record('writer', 1000, { promptTokens: 600, completionTokens: 400 });
assert(budgetTracker.totalTokens === 1000, `totalTokens=1000 (got ${budgetTracker.totalTokens})`);
assert(budgetTracker.totalCost > 0, `totalCost>0 (got ${budgetTracker.totalCost})`);
assert(budgetTracker.agentUsage.writer !== undefined, 'writer agent usage recorded');
assert(budgetTracker.agentUsage.writer.tokens === 1000, 'writer tokens=1000');
assert(budgetTracker.agentUsage.writer.promptTokens === 600, 'writer promptTokens=600');
assert(budgetTracker.agentUsage.writer.completionTokens === 400, 'writer completionTokens=400');

budgetTracker.record('reviewer', 500);
assert(budgetTracker.totalTokens === 1500, `totalTokens=1500 (got ${budgetTracker.totalTokens})`);
assert(budgetTracker.agentUsage.reviewer.tokens === 500, 'reviewer tokens=500');

// ── isOverBudget / getRemainingBudget ──
console.log('\n=== budgetTracker.budget ===');
assert(budgetTracker.isOverBudget() === false, 'not over budget yet');

budgetTracker.reset(0.001);
budgetTracker.record('test', 1000000);
assert(budgetTracker.isOverBudget() === true, 'over budget after large usage');
assert(budgetTracker.getRemainingBudget() < 0, 'remaining budget is negative');

// ── getReport ──
console.log('\n=== budgetTracker.getReport ===');
budgetTracker.reset(5.0);
budgetTracker.record('writer', 1000, { promptTokens: 600, completionTokens: 400 });
budgetTracker.record('reviewer', 2000, { promptTokens: 1200, completionTokens: 800 });
const report = budgetTracker.getReport();
assert(typeof report.totalTokens === 'number', 'report has totalTokens');
assert(typeof report.totalCost === 'string', 'report has totalCost as string');
assert(report.budgetLimit === 5.0, 'report has budgetLimit');
assert(typeof report.remaining === 'string', 'report has remaining as string');
assert(typeof report.byAgent === 'object', 'report has byAgent');
assert(Object.keys(report.byAgent).length === 2, 'report has 2 agents');

// ── getStageReport ──
console.log('\n=== budgetTracker.getStageReport ===');
const stageReport = budgetTracker.getStageReport();
assert(typeof stageReport === 'object', 'getStageReport returns object');
assert(stageReport.writer !== undefined, 'stageReport has writer');
assert(stageReport.writer.promptTokens === 600, 'stageReport writer promptTokens');

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);

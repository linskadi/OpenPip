// 测试 model-router 模块
const {
  routeModel,
  routeModelForAgent,
  routeHybridModel,
  loadTierMatrix,
  scoreComplexity,
  AGENT_TIER_MAP,
} = require('../engine/llm/model-router');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log(`  PASS: ${msg}`); }
  else { failed++; console.log(`  FAIL: ${msg}`); }
}

// ── AGENT_TIER_MAP ──
console.log('=== AGENT_TIER_MAP ===');
assert(typeof AGENT_TIER_MAP === 'object', 'AGENT_TIER_MAP is object');
assert(AGENT_TIER_MAP.orchestrator === 'L0', 'orchestrator tier=L0');
assert(AGENT_TIER_MAP.writer === 'L1', 'writer tier=L1');
assert(AGENT_TIER_MAP.reviewer === 'L2', 'reviewer tier=L2');
const agentCount = Object.keys(AGENT_TIER_MAP).length;
assert(agentCount === 7, `7 agent types (got ${agentCount})`);

// ── scoreComplexity ──
console.log('\n=== scoreComplexity ===');
assert(scoreComplexity(null) === 0.5, 'null returns 0.5');
assert(scoreComplexity('') === 0.5, 'empty returns 0.5');
const c1 = scoreComplexity('创新方法理论分析');
assert(c1 > 0.6, `innovation task complexity>0.6 (got ${c1})`);
const c2 = scoreComplexity('润色格式检查');
assert(c2 < 0.3, `polish task complexity<0.3 (got ${c2})`);
const c3 = scoreComplexity('实验数据分析');
assert(c3 > 0.4, `experiment task complexity>0.4 (got ${c3})`);

// ── routeModel ──
console.log('\n=== routeModel ===');
const r1 = routeModel('writing');
assert(typeof r1 === 'object', 'routeModel returns object');
assert(typeof r1.model === 'string', 'routeModel returns model string');
assert(typeof r1.tier === 'string', 'routeModel returns tier string');
assert(typeof r1.promptVariant === 'string', 'routeModel returns promptVariant string');

const r2 = routeModel('review');
assert(r2.tier !== undefined, 'review route has tier');

const r3 = routeModel('polish');
assert(r3.tier !== undefined, 'polish route has tier');

const r4 = routeModel('writing', 'L0');
assert(r4.tier === 'L0', `user override to L0 (got ${r4.tier})`);
assert(r4.promptVariant === 'strict', 'L0 variant is strict');

const r5 = routeModel('writing', 'L2');
assert(r5.tier === 'L2', `user override to L2 (got ${r5.tier})`);

// ── routeModelForAgent ──
console.log('\n=== routeModelForAgent ===');
const a1 = routeModelForAgent('writer', '写绪论');
assert(a1.tier === 'L1', `writer default L1 (got ${a1.tier})`);

const a2 = routeModelForAgent('reviewer', '审稿');
assert(a2.tier === 'L2', `reviewer default L2 (got ${a2.tier})`);

const a3 = routeModelForAgent('orchestrator', '调度');
assert(a3.tier === 'L0', `orchestrator default L0 (got ${a3.tier})`);

// ── routeHybridModel ──
console.log('\n=== routeHybridModel ===');
const hybrid = routeHybridModel({
  draft: 'writing',
  review: 'review',
  format: 'polish',
});
assert(typeof hybrid === 'object', 'routeHybridModel returns object');
assert(hybrid.draft !== undefined, 'hybrid has draft');
assert(hybrid.review !== undefined, 'hybrid has review');
assert(hybrid.format !== undefined, 'hybrid has format');
assert(hybrid.draft.model !== undefined, 'hybrid draft has model');

// ── loadTierMatrix ──
console.log('\n=== loadTierMatrix ===');
const matrix = loadTierMatrix();
if (matrix) {
  assert(typeof matrix === 'object', 'matrix is object');
  assert(matrix.tiers !== undefined, 'matrix has tiers');
} else {
  console.log('  (matrix YAML not found, using defaults)');
  assert(true, 'loadTierMatrix returns null gracefully');
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);

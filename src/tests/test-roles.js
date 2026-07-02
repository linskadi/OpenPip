// roles 模块单元测试
console.log('=== roles 模块单元测试 ===\n');

const results = {
  passed: 0,
  failed: 0,
  errors: [],
};

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    results.passed++;
  } catch (err) {
    console.log(`❌ ${name}: ${err.message}`);
    results.failed++;
    results.errors.push({ name, error: err.message });
  }
}

// 测试 loader.js 模块
console.log('--- loader.js 模块 ---');

test('loader.js 导出存在性', () => {
  const loader = require('../engine/roles/loader');
  if (!loader) throw new Error('模块加载失败');
  if (typeof loader.loadRole !== 'function') throw new Error('缺少 loadRole 函数');
  if (typeof loader.loadAgent !== 'function') throw new Error('缺少 loadAgent 函数');
  if (!loader.SUBTASK_TO_TASK_TYPE) throw new Error('缺少 SUBTASK_TO_TASK_TYPE');
  if (!loader.AGENT_TO_TASK_TYPE) throw new Error('缺少 AGENT_TO_TASK_TYPE');
  if (!loader.CORE_RULES_BY_ROLE) throw new Error('缺少 CORE_RULES_BY_ROLE');
});

test('SUBTASK_TO_TASK_TYPE 映射完整', () => {
  const { SUBTASK_TO_TASK_TYPE } = require('../engine/roles/loader');
  const expectedKeys = ['draft', 'polish', 'summary', 'format', 'figure', 'competition-draft', 'replan'];
  for (const key of expectedKeys) {
    if (!SUBTASK_TO_TASK_TYPE[key]) throw new Error(`缺少映射: ${key}`);
  }
});

test('AGENT_TO_TASK_TYPE 映射完整', () => {
  const { AGENT_TO_TASK_TYPE } = require('../engine/roles/loader');
  const expectedKeys = ['researcher', 'planner', 'writer', 'reviewer', 'coder', 'formatter'];
  for (const key of expectedKeys) {
    if (!AGENT_TO_TASK_TYPE[key]) throw new Error(`缺少映射: ${key}`);
  }
});

test('CORE_RULES_BY_ROLE 配置完整', () => {
  const { CORE_RULES_BY_ROLE } = require('../engine/roles/loader');
  const expectedRoles = ['writer', 'formatter', 'reviewer', 'researcher', 'planner', 'orchestrator', 'coder'];
  for (const role of expectedRoles) {
    if (!(role in CORE_RULES_BY_ROLE)) throw new Error(`缺少角色规则: ${role}`);
  }
});

test('loadRole 和 loadAgent 是同一函数', () => {
  const { loadRole, loadAgent } = require('../engine/roles/loader');
  if (loadRole !== loadAgent) throw new Error('loadRole 和 loadAgent 应该是同一函数的别名');
});

// 测试 dispatcher.js 模块
console.log('\n--- dispatcher.js 模块 ---');

test('dispatcher.js 导出存在性', () => {
  const dispatcher = require('../engine/roles/dispatcher');
  if (!dispatcher) throw new Error('模块加载失败');
  if (typeof dispatcher.dispatchRole !== 'function') throw new Error('缺少 dispatchRole 函数');
  if (typeof dispatcher.dispatchAgent !== 'function') throw new Error('缺少 dispatchAgent 函数');
  if (typeof dispatcher.dispatchRoleWithState !== 'function') throw new Error('缺少 dispatchRoleWithState 函数');
  if (typeof dispatcher.dispatchAgentWithState !== 'function') throw new Error('缺少 dispatchAgentWithState 函数');
  if (typeof dispatcher.buildDynamicContext !== 'function') throw new Error('缺少 buildDynamicContext 函数');
  if (typeof dispatcher.writeBackBlackboard !== 'function') throw new Error('缺少 writeBackBlackboard 函数');
  if (typeof dispatcher.extractIntegrity !== 'function') throw new Error('缺少 extractIntegrity 函数');
});

test('dispatchRole 和 dispatchAgent 是同一函数', () => {
  const { dispatchRole, dispatchAgent } = require('../engine/roles/dispatcher');
  if (dispatchRole !== dispatchAgent) throw new Error('dispatchRole 和 dispatchAgent 应该是同一函数的别名');
});

test('dispatchRoleWithState 和 dispatchAgentWithState 是同一函数', () => {
  const { dispatchRoleWithState, dispatchAgentWithState } = require('../engine/roles/dispatcher');
  if (dispatchRoleWithState !== dispatchAgentWithState) throw new Error('dispatchRoleWithState 和 dispatchAgentWithState 应该是同一函数的别名');
});

test('buildDynamicContext 基础功能', () => {
  const { buildDynamicContext } = require('../engine/roles/dispatcher');
  const bb = {
    research: { contribution: { title: '测试贡献' } },
    memory: { knownIssues: ['问题1', '问题2'] },
  };
  const config = { targetVenue: '测试期刊' };
  const context = buildDynamicContext('researcher', null, bb, config, '');
  if (typeof context !== 'object') throw new Error('返回值不是对象');
  if (!context.contribution) throw new Error('不包含 contribution');
  if (!context.targetVenue) throw new Error('不包含 targetVenue');
  if (!context.knownIssues) throw new Error('不包含 knownIssues');
});

test('buildDynamicContext writer 章节信息', () => {
  const { buildDynamicContext } = require('../engine/roles/dispatcher');
  const bb = {
    outline: {
      chapters: [
        { name: '引言', goal: '介绍背景' },
        { name: '方法', goal: '介绍方法' },
      ],
    },
    draft: {
      chapters: [
        { ending: '第一章结尾' },
      ],
    },
  };
  const task = 'chapter: 2';
  const context = buildDynamicContext('writer', 'draft', bb, {}, task);
  if (!context.currentChapter) throw new Error('不包含 currentChapter');
  if (!context.previousChapterEnding) throw new Error('不包含 previousChapterEnding');
});

test('extractIntegrity 基础功能', () => {
  const { extractIntegrity } = require('../engine/roles/dispatcher');
  const report = `
引用: ✅
公式: ✅
图表: ❌
术语: ✅
`;
  const result = extractIntegrity(report);
  if (typeof result !== 'object') throw new Error('返回值不是对象');
  if (result.refs !== true) throw new Error('refs 应为 true');
  if (result.formulas !== true) throw new Error('formulas 应为 true');
  if (result.figures !== false) throw new Error('figures 应为 false');
  if (result.terms !== true) throw new Error('terms 应为 true');
});

test('extractIntegrity 全通过', () => {
  const { extractIntegrity } = require('../engine/roles/dispatcher');
  const report = '引用: ✅ 公式: ✅ 图表: ✅ 术语: ✅';
  const result = extractIntegrity(report);
  if (result.refs !== true) throw new Error('refs 应为 true');
  if (result.formulas !== true) throw new Error('formulas 应为 true');
  if (result.figures !== true) throw new Error('figures 应为 true');
  if (result.terms !== true) throw new Error('terms 应为 true');
});

test('extractIntegrity 全失败', () => {
  const { extractIntegrity } = require('../engine/roles/dispatcher');
  const report = '引用: ❌ 公式: ❌ 图表: ❌ 术语: ❌';
  const result = extractIntegrity(report);
  if (result.refs !== false) throw new Error('refs 应为 false');
  if (result.formulas !== false) throw new Error('formulas 应为 false');
  if (result.figures !== false) throw new Error('figures 应为 false');
  if (result.terms !== false) throw new Error('terms 应为 false');
});

test('writeBackBlackboard 函数存在', () => {
  const { writeBackBlackboard } = require('../engine/roles/dispatcher');
  if (typeof writeBackBlackboard !== 'function') throw new Error('writeBackBlackboard 不是函数');
});

// 输出结果
console.log('\n=== 测试结果 ===');
console.log(`✅ 通过: ${results.passed}`);
console.log(`❌ 失败: ${results.failed}`);
console.log(`总计: ${results.passed + results.failed}`);

if (results.errors.length > 0) {
  console.log('\n--- 失败详情 ---');
  for (const err of results.errors) {
    console.log(`  ${err.name}: ${err.error}`);
  }
}

process.exit(results.failed > 0 ? 1 : 0);

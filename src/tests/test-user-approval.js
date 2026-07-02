// user-approval 模块单元测试
console.log('=== user-approval 模块单元测试 ===\n');

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

// 测试 gate.js 模块
console.log('--- gate.js 模块 ---');

test('gate.js 导出存在性', () => {
  const gate = require('../engine/user-approval/gate');
  if (!gate) throw new Error('模块加载失败');
  if (typeof gate.approvalGate !== 'function') throw new Error('缺少 approvalGate 函数');
  if (typeof gate.UserAbortError !== 'function') throw new Error('缺少 UserAbortError 类');
  if (typeof gate.formatStageSummary !== 'function') throw new Error('缺少 formatStageSummary 函数');
  if (typeof gate.printPreview !== 'function') throw new Error('缺少 printPreview 函数');
});

test('UserAbortError 正确实例化', () => {
  const { UserAbortError } = require('../engine/user-approval/gate');
  const err = new UserAbortError('测试中断');
  if (!(err instanceof Error)) throw new Error('不是 Error 实例');
  if (!(err instanceof UserAbortError)) throw new Error('不是 UserAbortError 实例');
  if (err.message !== '测试中断') throw new Error('message 不正确');
  if (err.name !== 'UserAbortError') throw new Error('name 不正确');
});

test('UserAbortError name 属性', () => {
  const { UserAbortError } = require('../engine/user-approval/gate');
  const err = new UserAbortError('用户中止');
  if (err.name !== 'UserAbortError') throw new Error(`name 应为 UserAbortError，实际为 ${err.name}`);
});

test('formatStageSummary 基本功能', () => {
  const { formatStageSummary } = require('../engine/user-approval/gate');
  const stage = { id: 'test-stage', agent: 'writer', output: 'output/test.md' };
  const result = '这是测试内容'.repeat(10);
  const projectDir = __dirname;
  const summary = formatStageSummary(stage, result, projectDir, null, null);
  if (typeof summary !== 'string') throw new Error('返回值不是字符串');
  if (!summary.includes('test-stage')) throw new Error('不包含阶段 ID');
  if (!summary.includes('writer')) throw new Error('不包含 agent 名');
});

test('formatStageSummary 包含质量分', () => {
  const { formatStageSummary } = require('../engine/user-approval/gate');
  const stage = { id: 'test', agent: 'writer', output: 'test.md' };
  const summary = formatStageSummary(stage, 'content', __dirname, 85, 1200);
  if (!summary.includes('质量分: 85/100')) throw new Error('不包含质量分');
});

test('formatStageSummary 包含耗时', () => {
  const { formatStageSummary } = require('../engine/user-approval/gate');
  const stage = { id: 'test', agent: 'writer', output: 'test.md' };
  const summary = formatStageSummary(stage, 'content', __dirname, null, 5000);
  if (!summary.includes('耗时:')) throw new Error('不包含耗时');
});

test('printPreview 函数存在且可调用', () => {
  const { printPreview } = require('../engine/user-approval/gate');
  if (typeof printPreview !== 'function') throw new Error('printPreview 不是函数');
});

// 测试 feedback.js 模块
console.log('\n--- feedback.js 模块 ---');

test('feedback.js 导出存在性', () => {
  const feedback = require('../engine/user-approval/feedback');
  if (!feedback) throw new Error('模块加载失败');
  if (typeof feedback.buildRevisionPrompt !== 'function') throw new Error('缺少 buildRevisionPrompt 函数');
});

test('buildRevisionPrompt 基本功能', () => {
  const { buildRevisionPrompt } = require('../engine/user-approval/feedback');
  const originalTask = '撰写论文';
  const userFeedback = '请增加引言部分';
  const stage = { approval: { maxFeedbackRounds: 3 } };
  const result = buildRevisionPrompt(originalTask, userFeedback, stage, '');
  if (typeof result !== 'string') throw new Error('返回值不是字符串');
  if (!result.includes(originalTask)) throw new Error('不包含原始任务');
  if (!result.includes(userFeedback)) throw new Error('不包含用户反馈');
});

test('buildRevisionPrompt 短反馈处理', () => {
  const { buildRevisionPrompt } = require('../engine/user-approval/feedback');
  const shortFeedback = '改标题';
  const result = buildRevisionPrompt('任务', shortFeedback, {}, '');
  if (!result.includes('修改目标')) throw new Error('短反馈应包含修改目标');
});

test('buildRevisionPrompt 长反馈处理', () => {
  const { buildRevisionPrompt } = require('../engine/user-approval/feedback');
  const longFeedback = '这是一个比较长的反馈意见，包含多个需要修改的地方，比如引言部分需要补充背景，方法部分需要详细说明实验设置，结果部分需要增加统计分析。';
  const result = buildRevisionPrompt('任务', longFeedback, {}, '');
  if (!result.includes('修改要求')) throw new Error('长反馈应包含修改要求');
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

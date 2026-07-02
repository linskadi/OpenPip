const assert = require('assert');
const { mkdtempSync, mkdirSync, existsSync, readFileSync } = require('fs');
const { join } = require('path');
const os = require('os');

const projectRoot = process.cwd();

console.log('=== 错误恢复功能测试 ===\n');

async function testRetryWithTemperature() {
  console.log('--- 测试 1: 重试时 temperature 增加和错误提示前缀 ---');
  const projectDir = mkdtempSync(join(os.tmpdir(), 'op-retry-test-'));
  mkdirSync(join(projectDir, 'drafts'), { recursive: true });
  mkdirSync(join(projectDir, 'output'), { recursive: true });
  mkdirSync(join(projectDir, 'research'), { recursive: true });

  let callCount = 0;
  let lastConfig = null;
  let lastTask = null;

  const mockDispatcher = async (agentName, task, project, root, config) => {
    callCount++;
    lastConfig = config;
    lastTask = task;
    if (callCount === 1) {
      throw new Error('模拟第1次调用失败');
    }
    return '重试成功的内容';
  };

  const { executeSingleStage } = require('../engine/stage-executor');
  const stage = {
    id: 'research',
    agent: 'researcher',
    maxRetries: 1,
    approval: false,
    qualityCheck: false,
  };

  const result = await executeSingleStage(stage, 'test-project', '测试选题', projectRoot, {}, projectDir, mockDispatcher, null);

  assert.strictEqual(callCount, 2, '应该调用 2 次（1次失败 + 1次重试成功）');
  assert.ok(result.success, '最终应该成功');
  assert.ok(lastConfig.temperature > 0.7, `重试时 temperature 应该增加，实际为 ${lastConfig.temperature}`);
  assert.ok(lastTask.includes('上一次执行失败'), '重试任务应该包含错误提示前缀');
  assert.ok(lastTask.includes('模拟第1次调用失败'), '重试任务应该包含具体错误信息');

  console.log('✅ 重试时 temperature 增加和错误提示前缀测试通过');
  console.log(`   - 调用次数: ${callCount}`);
  console.log(`   - 重试 temperature: ${lastConfig.temperature}`);
}

async function testContinueOnFailure() {
  console.log('\n--- 测试 2: continueOnFailure 跳过失败阶段 ---');
  const projectDir = mkdtempSync(join(os.tmpdir(), 'op-continue-test-'));
  mkdirSync(join(projectDir, 'drafts'), { recursive: true });
  mkdirSync(join(projectDir, 'output'), { recursive: true });
  mkdirSync(join(projectDir, 'research'), { recursive: true });

  const mockDispatcher = async () => {
    throw new Error('模拟持续失败');
  };

  const { executeSingleStage } = require('../engine/stage-executor');
  const stage = {
    id: 'research',
    agent: 'researcher',
    maxRetries: 1,
    continueOnFailure: true,
    approval: false,
    qualityCheck: false,
  };

  const result = await executeSingleStage(stage, 'test-project', '测试选题', projectRoot, {}, projectDir, mockDispatcher, null);

  assert.strictEqual(result.success, false, 'success 应为 false');
  assert.strictEqual(result.skipped, true, 'skipped 应为 true');
  assert.ok(result.error, '应该包含错误信息');

  console.log('✅ continueOnFailure 跳过失败阶段测试通过');
  console.log(`   - success: ${result.success}`);
  console.log(`   - skipped: ${result.skipped}`);
  console.log(`   - error: ${result.error}`);
}

async function testCheckpointFailedState() {
  console.log('\n--- 测试 3: checkpoint 记录 failed 状态 ---');
  const projectDir = mkdtempSync(join(os.tmpdir(), 'op-checkpoint-test-'));
  mkdirSync(join(projectDir, 'drafts'), { recursive: true });
  mkdirSync(join(projectDir, 'output'), { recursive: true });
  mkdirSync(join(projectDir, 'research'), { recursive: true });

  const mockDispatcher = async () => {
    throw new Error('模拟持续失败');
  };

  const { executeSingleStage } = require('../engine/stage-executor');
  const { getCheckpointPath } = require('../engine/stage-helpers');
  const stage = {
    id: 'research',
    agent: 'researcher',
    maxRetries: 1,
    continueOnFailure: false,
    approval: false,
    qualityCheck: false,
  };

  const checkpoint = { pipeline: 'test', project: 'test', stages: [] };

  try {
    await executeSingleStage(stage, 'test-project', '测试选题', projectRoot, {}, projectDir, mockDispatcher, checkpoint);
    assert.fail('应该抛出错误');
  } catch (err) {
    assert.ok(err.message.includes('模拟持续失败'), '错误消息应正确');
  }

  const failedStage = checkpoint.stages.find(s => s.stage_id === 'research');
  assert.ok(failedStage, 'checkpoint 中应该有失败的 stage');
  assert.strictEqual(failedStage.success, false, 'success 应为 false');
  assert.strictEqual(failedStage.failed, true, 'failed 应为 true');
  assert.ok(failedStage.error, '应该有 error 字段');
  assert.strictEqual(failedStage.attempts, 2, '尝试次数应为 2（初始+1次重试）');

  const cpPath = getCheckpointPath(projectDir);
  assert.ok(existsSync(cpPath), 'checkpoint 文件应该存在');

  console.log('✅ checkpoint 记录 failed 状态测试通过');
  console.log(`   - success: ${failedStage.success}`);
  console.log(`   - failed: ${failedStage.failed}`);
  console.log(`   - attempts: ${failedStage.attempts}`);
}

async function testErrorLog() {
  console.log('\n--- 测试 4: 错误记录到 output/error-log.md ---');
  const projectDir = mkdtempSync(join(os.tmpdir(), 'op-errorlog-test-'));
  mkdirSync(join(projectDir, 'drafts'), { recursive: true });
  mkdirSync(join(projectDir, 'output'), { recursive: true });
  mkdirSync(join(projectDir, 'research'), { recursive: true });

  const mockDispatcher = async () => {
    throw new Error('模拟错误用于日志测试');
  };

  const { executeSingleStage } = require('../engine/stage-executor');
  const stage = {
    id: 'research',
    agent: 'researcher',
    maxRetries: 1,
    continueOnFailure: true,
    approval: false,
    qualityCheck: false,
  };

  await executeSingleStage(stage, 'test-project', '测试选题', projectRoot, {}, projectDir, mockDispatcher, null);

  const errorLogPath = join(projectDir, 'output', 'error-log.md');
  assert.ok(existsSync(errorLogPath), 'error-log.md 应该存在');

  const logContent = readFileSync(errorLogPath, 'utf-8');
  assert.ok(logContent.includes('流水线错误日志'), '应该包含日志标题');
  assert.ok(logContent.includes('research'), '应该包含 stage id');
  assert.ok(logContent.includes('模拟错误用于日志测试'), '应该包含错误信息');

  console.log('✅ 错误记录到 output/error-log.md 测试通过');
}

async function runAllTests() {
  try {
    await testRetryWithTemperature();
    await testContinueOnFailure();
    await testCheckpointFailedState();
    await testErrorLog();

    console.log('\n🎉 所有错误恢复功能测试通过！');
  } catch (err) {
    console.error('\n❌ 测试失败:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

runAllTests();

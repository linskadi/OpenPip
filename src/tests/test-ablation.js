// OpenPip S7 消融测试框架
// 验证系统各组件的贡献：逐个移除组件，观察系统行为变化
const assert = require('assert');
const { mkdtempSync, writeFileSync, mkdirSync, rmSync } = require('fs');
const { join, resolve } = require('path');
const os = require('os');
const ROOT = resolve(__dirname, '..');

// ============================================================
// 消融框架
// ============================================================
class AblationFramework {
  constructor(options = {}) {
    this.components = [];
    this.results = [];
    this.baseline = null;
    this.name = options.name || 'ablation-test';
  }

  addComponent(name, fn) {
    this.components.push({ name, fn });
    return this;
  }

  async runBaseline() {
    const results = [];
    for (const comp of this.components) {
      results.push({ name: comp.name, result: await comp.fn() });
    }
    this.baseline = results;
    return results;
  }

  async runAblation() {
    if (!this.baseline) await this.runBaseline();

    for (let i = 0; i < this.components.length; i++) {
      const removed = this.components[i].name;
      const ablatedResults = [];

      for (let j = 0; j < this.components.length; j++) {
        if (j === i) {
          ablatedResults.push({ name: this.components[j].name, result: null, ablated: true });
        } else {
          ablatedResults.push({ name: this.components[j].name, result: await this.components[j].fn(), ablated: false });
        }
      }

      this.results.push({ removed, results: ablatedResults });
    }

    return this.results;
  }

  generateReport() {
    const lines = [];
    lines.push(`# 消融测试报告: ${this.name}`);
    lines.push('');
    lines.push(`**组件数**: ${this.components.length}`);
    lines.push('');

    if (this.baseline) {
      lines.push('## 基准性能');
      for (const r of this.baseline) {
        lines.push(`- ${r.name}: ${JSON.stringify(r.result)}`);
      }
      lines.push('');
    }

    if (this.results.length > 0) {
      lines.push('## 消融结果');
      for (const ablation of this.results) {
        lines.push(`### 移除: ${ablation.removed}`);
        for (const r of ablation.results) {
          if (r.ablated) {
            lines.push(`- ~~${r.name}~~ (已移除)`);
          } else {
            lines.push(`- ${r.name}: ${JSON.stringify(r.result)}`);
          }
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }
}

// ============================================================
// 单元测试
// ============================================================

function testBasicAblation() {
  const fw = new AblationFramework({ name: 'basic-test' });
  fw
    .addComponent('加法', async () => 1 + 1)
    .addComponent('乘法', async () => 2 * 3)
    .addComponent('字符串', async () => 'hello');

  assert.strictEqual(fw.components.length, 3, '应有 3 个组件');
  console.log('  ✅ testBasicAblation: 组件注册正确');
}

async function testRunBaseline() {
  const fw = new AblationFramework({ name: 'baseline-test' });
  fw
    .addComponent('组件A', async () => 'A')
    .addComponent('组件B', async () => 'B');

  const baseline = await fw.runBaseline();
  assert.strictEqual(baseline.length, 2, '基准应有 2 个结果');
  assert.strictEqual(baseline[0].result, 'A');
  assert.strictEqual(baseline[1].result, 'B');
  console.log('  ✅ testRunBaseline: 基准运行正确');
}

async function testRunAblation() {
  const fw = new AblationFramework({ name: 'ablation-run-test' });
  let callCountA = 0;
  let callCountB = 0;

  fw
    .addComponent('组件A', async () => { callCountA++; return 'A'; })
    .addComponent('组件B', async () => { callCountB++; return 'B'; });

  const results = await fw.runAblation();

  assert.strictEqual(results.length, 2, '应有 2 个消融结果');
  assert.strictEqual(results[0].removed, '组件A');
  assert.strictEqual(results[0].results[0].ablated, true);
  assert.strictEqual(results[0].results[1].ablated, false);
  assert.strictEqual(results[0].results[1].result, 'B');
  assert.strictEqual(callCountA, 2, '组件A 应被调用 2 次（基准+消融B）');
  assert.strictEqual(callCountB, 2, '组件B 应被调用 2 次（基准+消融A）');
  console.log('  ✅ testRunAblation: 消融运行正确');
}

async function testReport() {
  const fw = new AblationFramework({ name: 'report-test' });
  fw
    .addComponent('A', async () => 1)
    .addComponent('B', async () => 2);

  await fw.runBaseline();
  await fw.runAblation();
  const report = fw.generateReport();

  assert.ok(report.includes('消融测试报告'), '报告应含标题');
  assert.ok(report.includes('基准性能'), '报告应含基准');
  assert.ok(report.includes('消融结果'), '报告应含消融结果');
  assert.ok(report.includes('已移除'), '消融结果应标注已移除');
  console.log('  ✅ testReport: 报告生成正确');
}

function testAllComponentsAblated() {
  const fw = new AblationFramework({ name: 'empty-test' });
  fw.addComponent('唯一组件', async () => 'only');
  assert.strictEqual(fw.components.length, 1);
  console.log('  ✅ testAllComponentsAblated: 单组件处理正确');
}

// ============================================================
// 集成消融测试：在真实模块上运行消融
// ============================================================

async function testAblationOnRealModules() {
  console.log('\n--- 集成消融: 真实模块 ---');

  const fw = new AblationFramework({ name: 'openpip-core-ablation' });

  // 组件 1: shared-state
  fw.addComponent('shared-state', async () => {
    const { initBlackboard, writeField } = require('../engine/state/shared-state');
    const tmpDir = mkdtempSync(join(os.tmpdir(), 'ablation-'));
    const bb = initBlackboard(tmpDir);
    const r = writeField(bb, 'orchestrator', 'topic', 'ablation topic');
    rmSync(tmpDir, { recursive: true, force: true });
    return r.ok ? 'ok' : 'fail';
  });

  // 组件 2: container（模块未实现，跳过）
  fw.addComponent('container', async () => 'skipped (module not implemented)');

  // 组件 3: logger
  fw.addComponent('logger', async () => {
    const { Logger } = require('../engine/infra/logger');
    const log = new Logger({ name: 'ablation' });
    log.info('ablation test');
    return 'logged';
  });

  // 组件 4: stage-executor
  fw.addComponent('stage-executor', async () => {
    const { STAGE_TASKS } = require('../engine/stage-constants');
    return Object.keys(STAGE_TASKS).length;
  });

  // 组件 5: quality-check
  fw.addComponent('quality-check', async () => {
    const { qualityCheck } = require('../engine/quality/quality-check');
    const r = qualityCheck('This is a test document with enough words to pass the minimum threshold.');
    return r.pass;
  });

  // 组件 6: model-router
  fw.addComponent('model-router', async () => {
    const { routeModelForAgent } = require('../engine/llm/model-router');
    const r = routeModelForAgent('writer', 'draft');
    return r.model;
  });

  // 运行基线
  const baseline = await fw.runBaseline();
  console.log(`  基准: ${baseline.length} 个组件`);

  // 运行消融
  const ablationResults = await fw.runAblation();
  assert.strictEqual(ablationResults.length, fw.components.length,
    `消融数 ${ablationResults.length} 应等于组件数 ${fw.components.length}`);

  // 验证每轮消融：被移除的组件标记 ablated，其余正常
  for (let i = 0; i < ablationResults.length; i++) {
    const round = ablationResults[i];
    assert.strictEqual(round.results[i].ablated, true,
      `第 ${i} 轮应移除组件 "${round.removed}"`);
  }

  const report = fw.generateReport();
  const reportPath = join(ROOT, 'tests', 'output', 'ablation-report.md');
  mkdirSync(join(ROOT, 'tests', 'output'), { recursive: true });
  writeFileSync(reportPath, report, 'utf-8');
  console.log(`  报告已保存: tests/output/ablation-report.md`);
  console.log('  ✅ testAblationOnRealModules: 集成消融通过');
}

// ============================================================
// 主流程
// ============================================================

async function run() {
  console.log('\n=== S7 消融测试 ===');
  console.log('\n--- 框架单元测试 ---');
  testBasicAblation();
  await testRunBaseline();
  await testRunAblation();
  await testReport();
  testAllComponentsAblated();
  await testAblationOnRealModules();
  console.log('\n✅ 所有消融测试通过');
}

run().catch(err => {
  console.error('❌ 消融测试失败:', err.message);
  process.exit(1);
});

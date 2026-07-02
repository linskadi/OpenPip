// P8.3: 性能基准测试
const { mkdtempSync, writeFileSync, existsSync, readFileSync, mkdirSync } = require('fs');
const { join, resolve } = require('path');
const os = require('os');
const { initBlackboard, loadBlackboard, saveBlackboard } = require('../engine/state/shared-state');

const projectRoot = process.cwd();
const BENCHMARK_DIR = resolve(projectRoot, 'src', 'tests', 'benchmarks');
const BASELINE_PATH = resolve(BENCHMARK_DIR, 'baseline.json');

const args = process.argv.slice(2);
const CI_MODE = args.includes('--ci');
const UPDATE_BASELINE = args.includes('--update-baseline');

async function runBenchmark() {
  if (CI_MODE) console.log('=== CI 基准测试 ===\n');
  else console.log('=== 性能基准测试 ===\n');

  const tmpDir = mkdtempSync(join(os.tmpdir(), 'bench-'));
  const projectDir = join(tmpDir, 'papers', 'bench-project');
  mkdirSync(projectDir, { recursive: true });

  const stages = ['research', 'planner', 'draft', 'review', 'formatter'];
  const results = [];

  const dispatch = async (agentName, _task) => {
    const bb = loadBlackboard(projectDir);
    let output = '';
    if (agentName === 'researcher') {
      output = '# 研究简报\n基准测试内容';
      bb.research.brief = output;
    } else if (agentName === 'planner') {
      output = JSON.stringify({ mode: 'research', title: '基准测试', chapters: [{ id: 1, name: '引言' }] });
      bb.outline = JSON.parse(output);
    } else if (agentName === 'writer') {
      output = '# 第1章 引言\n\n基准测试内容\n\n# 第2章 方法\n\n方法描述\n\n# 第3章 实验\n\n实验内容\n\n# 第4章 结论\n\n结论内容';
      bb.draft.full = output;
    } else if (agentName === 'reviewer') {
      output = '评分: 75/100\n决策: Minor\n意见1：实验部分可加强';
      bb.review.score = 75;
      bb.review.decision = 'Minor';
    } else if (agentName === 'formatter') {
      output = '# 格式化论文\n\n基准测试内容';
      bb.draft.full = output;
    }
    saveBlackboard(projectDir, bb);
    return output;
  };

  for (const stageId of stages) {
    const bb = initBlackboard(projectDir);
    bb.meta.topic = '基准测试';
    saveBlackboard(projectDir, bb);

    const start = Date.now();
    let output = '';
    try {
      output = await dispatch(stageId, `${stageId} task`);
    } catch (err) {
      console.error('  ❌', stageId, err.message);
      results.push({ stage: stageId, durationMs: 0, outputLength: 0, error: err.message });
      continue;
    }
    const elapsed = Date.now() - start;
    results.push({ stage: stageId, durationMs: elapsed, outputLength: output.length, error: null });
    console.log(`  ✅ ${stageId}: ${elapsed}ms (${output.length} chars)`);
  }

  const totalDuration = results.reduce((s, r) => s + r.durationMs, 0);
  const benchmarkResult = { timestamp: new Date().toISOString(), totalDurationMs: totalDuration, stages: results };

  let regressionDetected = false;
  if (existsSync(BASELINE_PATH)) {
    console.log('\n--- 与基准对比 ---');
    let baselineStr = readFileSync(BASELINE_PATH, 'utf-8');
    if (baselineStr.charCodeAt(0) === 0xFEFF) baselineStr = baselineStr.slice(1);
    const baseline = JSON.parse(baselineStr);
    for (const r of results) {
      const base = baseline.stages.find(s => s.stage === r.stage);
      if (base && base.durationMs > 0) {
        const change = ((r.durationMs - base.durationMs) / base.durationMs) * 100;
        const tag = change > 20 ? '⚠️ REGRESSION' : '✅';
        console.log(`  ${tag} ${r.stage}: ${r.durationMs}ms vs ${base.durationMs}ms (${change > 0 ? '+' : ''}${change.toFixed(1)}%)`);
        if (change > 20) regressionDetected = true;
      }
    }
  }

  if (!existsSync(BENCHMARK_DIR)) mkdirSync(BENCHMARK_DIR, { recursive: true });
  const resultPath = join(BENCHMARK_DIR, `benchmark-${Date.now()}.json`);
  writeFileSync(resultPath, JSON.stringify(benchmarkResult, null, 2), 'utf-8');

  console.log(`\n总耗时: ${totalDuration}ms, 结果: ${resultPath}`);

  if (!existsSync(BASELINE_PATH) || UPDATE_BASELINE) {
    writeFileSync(BASELINE_PATH, JSON.stringify(benchmarkResult, null, 2), 'utf-8');
    console.log(UPDATE_BASELINE ? '✅ 基准已更新' : '✅ 基准已创建');
  }

  if (UPDATE_BASELINE) {
    console.log('\n✅ 基准已更新（跳过回归检查）');
  } else if (regressionDetected) {
    console.log(CI_MODE ? '\n⚠️ 性能回归 (>20%)，CI 检查失败' : '\n⚠️ 性能回归');
    process.exit(1);
  } else {
    console.log('\n✅ 基准测试通过');
  }
}

runBenchmark().catch(err => {
  console.error('基准测试失败:', err.message);
  console.error(err.stack);
  process.exit(1);
});

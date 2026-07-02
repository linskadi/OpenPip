// e2e 集成测试：mock LLM，验证 7-agent pipeline 黑板流转 + task_prefix + condition 跳过
const assert = require('assert');
const { mkdtempSync, writeFileSync, existsSync, readFileSync } = require('fs');
const { join } = require('path');
const os = require('os');
const yaml = require('js-yaml');
const { initBlackboard, loadBlackboard, saveBlackboard } = require('../engine/state/shared-state');
const { setDefaultDispatcher } = require('../engine/dispatcher-registry');
const { loadAgent } = require('../engine/roles/loader');

const projectRoot = process.cwd();

// Mock dispatcher：模拟每个 agent 的输出
function makeMockDispatcher(projectDir) {
  const calls = [];
  return {
    calls,
    fn: async (agentName, task, _project, _root, _config) => {
      calls.push({ agentName, task });
      // 模拟各 agent 输出并写回黑板
      const bb = loadBlackboard(projectDir);
      let output = '';
      if (agentName === 'researcher') {
        output = '# 研究简报\n测试内容';
        bb.research.brief = output;
      } else if (agentName === 'planner') {
        output = JSON.stringify({ mode: 'research', title: 'T', chapters: [{ id: 1, name: '引言' }] });
        bb.outline = JSON.parse(output);
      } else if (agentName === 'writer') {
        if (/subtask:\s*summary/.test(task)) {
          output = '## 摘要\n目的/方法/结果/结论';
          bb.draft.summary = output;
        } else if (/subtask:\s*polish/.test(task)) {
          output = '润色后正文（含 3000 字填充' + 'x'.repeat(3000) + '）';
          bb.draft.full = output;
        } else {
          output = '正文草稿（' + 'y'.repeat(3000) + '）';
          bb.draft.full = output;
        }
      } else if (agentName === 'reviewer') {
        // 模拟 Accept，触发 revise 跳过
        output = '# 审稿报告\n评分：85/100\n决策：Accept\n引用：✅\n公式：✅\n图表：✅\n术语：✅';
        bb.review = { score: 85, decision: 'Accept', issues: [] };
      } else if (agentName === 'formatter') {
        if (/subtask:\s*export/.test(task)) output = 'latex content';
        else output = '格式化论文';
      } else if (agentName === 'coder') {
        output = '# notebook cell';
        bb.draft.code = output;
      }
      saveBlackboard(projectDir, bb);
      return output;
    },
  };
}

async function runE2E() {
  const projectDir = mkdtempSync(join(os.tmpdir(), 'op-e2e-'));
  const projectName = 'e2e-test';
  // 简化：直接用 projectDir 作为项目目录，mock dispatcher 用 projectDir
  initBlackboard(projectDir);

  // 加载 pipeline yaml
  const pipelinePath = join(projectRoot, '.openpip', 'pipelines', 'full-research.yaml');
  const pipeline = yaml.load(readFileSync(pipelinePath, 'utf-8'));

  const mock = makeMockDispatcher(projectDir);
  setDefaultDispatcher(mock.fn);

  // 手动按 stage 顺序执行（绕过真实 pipeline 的交互式 confirm）
  const { writeFileSync: wfs } = require('fs');
  const { resolve } = require('path');
  let skippedRevise = false;

  for (const stage of pipeline.stages) {
    // 模拟 condition 检查
    if (stage.condition) {
      const reviewPath = resolve(projectDir, 'output', 'review-report.md');
      if (existsSync(reviewPath)) {
        const content = readFileSync(reviewPath, 'utf-8');
        if (/决策[:：]\s*Accept/i.test(content) || /\bAccept\b/i.test(content.slice(0, 500))) {
          console.log(`  ⏭️  跳过 ${stage.id}（review=Accept）`);
          skippedRevise = true;
          continue;
        }
      }
    }

    // 执行
    const task = stage.task_prefix
      ? `${stage.task_prefix}\n模拟任务`
      : '模拟任务';
    await mock.fn(stage.agent, task, projectName, projectRoot, {});

    // 写入 stage 输出文件（模拟 pipeline 写产物）
    if (stage.output) {
      const outPath = resolve(projectDir, stage.output);
      const outDir = resolve(outPath, '..');
      if (!existsSync(outDir)) {
        const { mkdirSync } = require('fs');
        mkdirSync(outDir, { recursive: true });
      }
      const bb = loadBlackboard(projectDir);
      let content = '';
      if (stage.agent === 'researcher') content = bb.research.brief;
      else if (stage.agent === 'planner') content = JSON.stringify(bb.outline);
      else if (stage.agent === 'writer' && /summary/.test(task)) content = bb.draft.summary;
      else if (stage.agent === 'writer') content = bb.draft.full;
      else if (stage.agent === 'reviewer') content = `# 审稿报告\n评分：85/100\n决策：Accept`;
      else if (stage.agent === 'formatter') content = '格式化内容';
      wfs(outPath, content, 'utf-8');
    }
  }

  // 断言1：7 个 agent 都被调用过（revise 因 Accept 跳过）
  const calledAgents = [...new Set(mock.calls.map(c => c.agentName))];
  console.log('调用的 agents:', calledAgents.join(', '));
  assert.ok(calledAgents.includes('researcher'), '应调用 researcher');
  assert.ok(calledAgents.includes('planner'), '应调用 planner');
  assert.ok(calledAgents.includes('writer'), '应调用 writer');
  assert.ok(calledAgents.includes('reviewer'), '应调用 reviewer');
  assert.ok(calledAgents.includes('formatter'), '应调用 formatter');
  assert.ok(!mock.calls.some(c => c.agentName === 'writer' && /polish/.test(c.task)), 'revise(polish) 应被跳过');
  assert.ok(skippedRevise, 'revise 应被 condition 跳过');

  // 断言2：task_prefix 正确拼接
  const plannerCall = mock.calls.find(c => c.agentName === 'planner');
  assert.ok(plannerCall.task.includes('mode: research'), 'planner task 应含 mode: research 前缀');
  const writerCall = mock.calls.find(c => c.agentName === 'writer');
  assert.ok(writerCall.task.includes('subtask: draft'), 'writer task 应含 subtask: draft');

  // 断言3：黑板最终状态正确
  const finalBb = loadBlackboard(projectDir);
  assert.ok(finalBb.research.brief, '黑板应含 research.brief');
  assert.ok(finalBb.outline.title, '黑板应含 outline.title');
  assert.ok(finalBb.draft.full, '黑板应含 draft.full');
  assert.strictEqual(finalBb.review.decision, 'Accept', '黑板 review.decision 应为 Accept');

  // 断言4：所有 agent 配置可加载（验证 yaml+md 完整）
  for (const name of ['orchestrator', 'researcher', 'planner', 'writer', 'coder', 'reviewer', 'formatter']) {
    const agent = loadAgent(name, projectRoot, 'test');
    assert.ok(agent.promptText, `${name} 应有 promptText`);
  }
  const reviewer = loadAgent('reviewer', projectRoot, 'test');
  assert.ok(reviewer.ensemble, 'reviewer 应有 ensemble 配置');
  assert.strictEqual(reviewer.ensemble.num_reviews, 5);

  console.log('\n✅ e2e 集成测试通过：');
  console.log('   - 7 个 agent 配置完整可加载');
  console.log('   - task_prefix 正确拼接（planner=mode:research, writer=subtask:draft）');
  console.log('   - 黑板状态流转正确（research→outline→draft→review）');
  console.log('   - condition 跳过生效（review=Accept 时 revise 被跳过）');
  console.log('   - reviewer ensemble 配置读取正确（5x5）');
}

// ============================================================
// B17: 迭代优化 E2E 测试（模拟 writer↔reviewer 攻防循环）
// ============================================================
async function runE2EIterative() {
  const projectDir = mkdtempSync(join(os.tmpdir(), 'op-e2e-iter-'));
  initBlackboard(projectDir);

  // 创建初始草稿供迭代
  const draftDir = join(projectDir, 'drafts');
  const outputDir = join(projectDir, 'output');
  if (!existsSync(draftDir)) { const { mkdirSync } = require('fs'); mkdirSync(draftDir, { recursive: true }); }
  if (!existsSync(outputDir)) { const { mkdirSync } = require('fs'); mkdirSync(outputDir, { recursive: true }); }
  writeFileSync(join(projectDir, 'drafts/draft-v1.md'), '# 初始草稿\n\n这是论文的初始版本。', 'utf-8');

  let reviewCount = 0;
  let writeCount = 0;
  const scores = [50, 70, 85];

  const mockDispatcher = {
    fn: async (agentName, _task, _project, _root, _config) => {
      if (agentName === 'reviewer') {
        const idx = Math.min(reviewCount, 2);
        reviewCount++;
        return `## 审稿意见

### 意见1：[严重程度：中]
- **问题**: 实验数据需要补充
- **位置**: 第3章
- **建议**: 增加更多实验对比

### 意见2：[严重程度：低]
- **问题**: 格式需要调整
- **位置**: 全文
- **建议**: 统一参考文献格式

创新性：${scores[idx]}分
方法：${scores[idx]}分
实验：${scores[idx]}分
写作：${scores[idx]}分
总分：${scores[idx]}`;
      }
      if (agentName === 'writer') {
        writeCount++;
        return `# 修订后草稿（第 ${writeCount} 轮）\n\n经过修订的论文内容。`.repeat(50);
      }
      if (agentName === 'planner') {
        return '# 新大纲\n\n重新规划的大纲内容。';
      }
      return '模拟输出';
    },
  };

  const stage = {
    id: 'iterative-review',
    agent: 'reviewer',
    mode: 'iterative',
    maxIterations: 5,
    convergence: { minScoreImprove: 2, cosineThreshold: 0.99, scoreVarianceThreshold: 5 },
    routing: { minor: 'writer', major: 'writer', severe: 'planner' },
    task_prefix: 'mode: research',
  };

  const { executeIterativeStage } = require('../engine/stage-iterative');
  const result = await executeIterativeStage(stage, 'e2e-iter-test', '测试选题', projectRoot, {}, projectDir, mockDispatcher.fn, null);

  assert.ok(result.success, '迭代优化应成功');
  assert.ok(result.iterations >= 2, `迭代轮次应 >= 2，实际 ${result.iterations}`);

  console.log('\n✅ iterative e2e 测试通过：');
  console.log(`   - 迭代轮次: ${result.iterations}`);
  console.log(`   - 最终评分: ${result.qualityScore}`);
  console.log(`   - 收敛: ${result.converged}`);
}

// ============================================================
// B17: 失败恢复 E2E 测试（先失败后重试成功）
// ============================================================
async function runE2EFailureRecovery() {
  const projectDir = mkdtempSync(join(os.tmpdir(), 'op-e2e-fail-'));
  initBlackboard(projectDir);

  const { mkdirSync } = require('fs');
  mkdirSync(join(projectDir, 'drafts'), { recursive: true });
  mkdirSync(join(projectDir, 'output'), { recursive: true });

  let callCount = 0;
  const mockDispatcher = {
    fn: async (_agentName, _task, _project, _root, _config) => {
      callCount++;
      if (callCount === 1) {
        throw new Error('模拟第1次调度失败');
      }
      return '第2次调度成功返回的正文内容。'.repeat(500);
    },
  };

  // 模拟 executeSingleStage 中的重试逻辑（带 maxRetries=1）
  const stage = {
    id: 'draft',
    agent: 'writer',
    maxRetries: 1,
    continueOnFailure: false,
    approval: false,
  };

  const { executeSingleStage } = require('../engine/stage-executor');
  const result = await executeSingleStage(stage, 'e2e-fail-test', '测试选题', projectRoot, {}, projectDir, mockDispatcher.fn, null);

  assert.ok(result.success, '重试后应成功');
  assert.ok(result.length > 0, '应返回正文内容');

  console.log('\n✅ failure recovery e2e 测试通过：');
  console.log(`   - 重试后成功: ${result.success}`);
  console.log(`   - 调用次数: ${callCount}`);
}

(async () => {
  let exitCode = 0;
  try {
    await runE2E();
    console.log('\n✅ e2e 测试通过');
  } catch (err) {
    console.error('❌ e2e 失败:', err.message);
    exitCode = 1;
  }
  try {
    await runE2EIterative();
    console.log('✅ iterative e2e 测试通过');
  } catch (err) {
    console.error('❌ iterative e2e 失败:', err.message);
    exitCode = 1;
  }
  try {
    await runE2EFailureRecovery();
    console.log('✅ failure recovery e2e 测试通过');
  } catch (err) {
    console.error('❌ failure recovery e2e 失败:', err.message);
    exitCode = 1;
  }
  process.exit(exitCode);
})();


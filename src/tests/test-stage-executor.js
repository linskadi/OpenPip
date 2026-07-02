// stage-executor 模块单元测试
console.log('=== stage-executor 模块单元测试 ===\n');

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

// 测试模块导出
console.log('--- 模块导出 ---');

test('模块导出存在性', () => {
  const se = require('../engine/stage-executor');
  const si = require('../engine/stage-iterative');
  const sh = require('../engine/stage-hooks');
  const shp = require('../engine/stage-helpers');
  const sc = require('../engine/stage-constants');
  if (!se) throw new Error('模块加载失败');
  if (typeof se.executeSingleStage !== 'function') throw new Error('缺少 executeSingleStage');
  if (typeof se.executeParallelGroup !== 'function') throw new Error('缺少 executeParallelGroup');
  if (typeof se.executeSequentialStage !== 'function') throw new Error('缺少 executeSequentialStage');
  if (typeof se.executeSingleShot !== 'function') throw new Error('缺少 executeSingleShot');
  if (typeof si.executeIterativeStage !== 'function') throw new Error('缺少 executeIterativeStage');
  if (typeof sh.runPostStageHooks !== 'function') throw new Error('缺少 runPostStageHooks');
  if (typeof shp.parseOutlineSections !== 'function') throw new Error('缺少 parseOutlineSections');
  if (typeof shp.updateConsistencyMemory !== 'function') throw new Error('缺少 updateConsistencyMemory');
  if (typeof shp.saveVersion !== 'function') throw new Error('缺少 saveVersion');
  if (typeof shp.saveCheckpoint !== 'function') throw new Error('缺少 saveCheckpoint');
  if (typeof shp.getCheckpointPath !== 'function') throw new Error('缺少 getCheckpointPath');
  if (typeof si.parseScore !== 'function') throw new Error('缺少 parseScore');
  if (typeof si.parseDecision !== 'function') throw new Error('缺少 parseDecision');
  if (typeof si.routeByDecision !== 'function') throw new Error('缺少 routeByDecision');
  if (typeof si.renderIterativeReport !== 'function') throw new Error('缺少 renderIterativeReport');
  if (typeof sh.renderFactCheckReport !== 'function') throw new Error('缺少 renderFactCheckReport');
  if (typeof sc.STAGE_TASKS !== 'object') throw new Error('缺少 STAGE_TASKS');
  if (typeof sc.STAGE_OUTPUTS !== 'object') throw new Error('缺少 STAGE_OUTPUTS');
  if (typeof sc.CHAPTER_OUTPUT_PREFIX !== 'string') throw new Error('缺少 CHAPTER_OUTPUT_PREFIX');
  if (typeof sc.ITERATIVE_OUTPUTS !== 'object') throw new Error('缺少 ITERATIVE_OUTPUTS');
  if (typeof sc.PARALLEL_CONFIG !== 'object') throw new Error('缺少 PARALLEL_CONFIG');
});

test('STAGE_TASKS 常量存在', () => {
  const { STAGE_TASKS } = require('../engine/stage-constants');
  if (!STAGE_TASKS) throw new Error('缺少 STAGE_TASKS');
  if (typeof STAGE_TASKS !== 'object') throw new Error('STAGE_TASKS 不是对象');
});

test('STAGE_OUTPUTS 常量存在', () => {
  const { STAGE_OUTPUTS } = require('../engine/stage-constants');
  if (!STAGE_OUTPUTS) throw new Error('缺少 STAGE_OUTPUTS');
  if (typeof STAGE_OUTPUTS !== 'object') throw new Error('STAGE_OUTPUTS 不是对象');
});

test('CHAPTER_OUTPUT_PREFIX 常量存在', () => {
  const { CHAPTER_OUTPUT_PREFIX } = require('../engine/stage-constants');
  if (!CHAPTER_OUTPUT_PREFIX) throw new Error('缺少 CHAPTER_OUTPUT_PREFIX');
  if (typeof CHAPTER_OUTPUT_PREFIX !== 'string') throw new Error('CHAPTER_OUTPUT_PREFIX 不是字符串');
});

test('ITERATIVE_OUTPUTS 常量存在', () => {
  const { ITERATIVE_OUTPUTS } = require('../engine/stage-constants');
  if (!ITERATIVE_OUTPUTS) throw new Error('缺少 ITERATIVE_OUTPUTS');
  if (typeof ITERATIVE_OUTPUTS !== 'object') throw new Error('ITERATIVE_OUTPUTS 不是对象');
});

// 测试 STAGE_TASKS 和 STAGE_OUTPUTS 键匹配
console.log('\n--- 阶段配置 ---');

test('STAGE_TASKS 包含所有必需阶段', () => {
  const { STAGE_TASKS } = require('../engine/stage-constants');
  const requiredStages = ['research', 'skeleton', 'code', 'draft', 'summary', 'review', 'revise', 'format', 'figure', 'export', 'evolve'];
  for (const stage of requiredStages) {
    if (!STAGE_TASKS[stage]) throw new Error(`缺少阶段任务: ${stage}`);
  }
});

test('STAGE_OUTPUTS 包含所有必需阶段', () => {
  const { STAGE_OUTPUTS } = require('../engine/stage-constants');
  const requiredStages = ['research', 'skeleton', 'code', 'draft', 'summary', 'review', 'revise', 'format', 'figure', 'export', 'evolve'];
  for (const stage of requiredStages) {
    if (!STAGE_OUTPUTS[stage]) throw new Error(`缺少阶段输出: ${stage}`);
  }
});

test('STAGE_TASKS 函数返回字符串', () => {
  const { STAGE_TASKS } = require('../engine/stage-constants');
  const result = STAGE_TASKS.research('测试选题');
  if (typeof result !== 'string') throw new Error('返回值不是字符串');
  if (result.length === 0) throw new Error('返回值为空');
});

// 测试 parseOutlineSections
console.log('\n--- parseOutlineSections ---');

test('parseOutlineSections 解析二级标题', () => {
  const { parseOutlineSections } = require('../engine/stage-helpers');
  const fs = require('fs');
  const path = require('path');
  const tmpFile = path.join(__dirname, 'tmp-outline.md');
  fs.writeFileSync(tmpFile, '## 引言\n\n引言内容\n\n## 方法\n\n方法内容\n', 'utf-8');
  const sections = parseOutlineSections(tmpFile);
  fs.unlinkSync(tmpFile);
  if (!Array.isArray(sections)) throw new Error('返回值不是数组');
  if (sections.length !== 2) throw new Error(`应有 2 个章节，实际 ${sections.length}`);
  if (sections[0].title !== '引言') throw new Error(`第一章标题不正确: ${sections[0].title}`);
  if (sections[0].level !== 2) throw new Error('级别应为 2');
});

test('parseOutlineSections 解析三级标题', () => {
  const { parseOutlineSections } = require('../engine/stage-helpers');
  const fs = require('fs');
  const path = require('path');
  const tmpFile = path.join(__dirname, 'tmp-outline2.md');
  fs.writeFileSync(tmpFile, '## 引言\n\n### 背景\n\n背景内容\n\n### 意义\n\n意义内容\n', 'utf-8');
  const sections = parseOutlineSections(tmpFile);
  fs.unlinkSync(tmpFile);
  if (sections.length !== 3) throw new Error(`应有 3 个章节，实际 ${sections.length}`);
  if (sections[1].level !== 3) throw new Error('二级标题后的三级标题级别应为 3');
});

test('parseOutlineSections 去除标题编号', () => {
  const { parseOutlineSections } = require('../engine/stage-helpers');
  const fs = require('fs');
  const path = require('path');
  const tmpFile = path.join(__dirname, 'tmp-outline3.md');
  fs.writeFileSync(tmpFile, '## 1 引言\n\n内容\n', 'utf-8');
  const sections = parseOutlineSections(tmpFile);
  fs.unlinkSync(tmpFile);
  if (sections.length !== 1) throw new Error(`应有 1 个章节，实际 ${sections.length}`);
  if (sections[0].title !== '引言') throw new Error(`应去除编号，实际标题: ${sections[0].title}`);
});

test('parseOutlineSections 不存在的文件返回空数组', () => {
  const { parseOutlineSections } = require('../engine/stage-helpers');
  const sections = parseOutlineSections('/nonexistent/path.md');
  if (!Array.isArray(sections)) throw new Error('返回值不是数组');
  if (sections.length !== 0) throw new Error('不存在的文件应返回空数组');
});

// 测试 parseScore
console.log('\n--- parseScore ---');

test('parseScore 解析标准分数格式', () => {
  const { parseScore } = require('../engine/stage-iterative');
  const score = parseScore('综合评分: 85/100');
  if (score !== 85) throw new Error(`应返回 85，实际 ${score}`);
});

test('parseScore 无分数返回默认值', () => {
  const { parseScore } = require('../engine/stage-iterative');
  const score = parseScore('没有分数');
  if (score !== 50) throw new Error(`应返回默认值 50，实际 ${score}`);
});

// 测试 parseDecision
console.log('\n--- parseDecision ---');

test('parseDecision 解析 Severe', () => {
  const { parseDecision } = require('../engine/stage-iterative');
  const decision = parseDecision('Severe revisions required');
  if (decision !== 'Severe') throw new Error(`应返回 Severe，实际 ${decision}`);
});

test('parseDecision 解析 Major', () => {
  const { parseDecision } = require('../engine/stage-iterative');
  const decision = parseDecision('Major revisions');
  if (decision !== 'Major') throw new Error(`应返回 Major，实际 ${decision}`);
});

test('parseDecision 解析 Minor', () => {
  const { parseDecision } = require('../engine/stage-iterative');
  const decision = parseDecision('Minor changes');
  if (decision !== 'Minor') throw new Error(`应返回 Minor，实际 ${decision}`);
});

test('parseDecision 解析 Accept', () => {
  const { parseDecision } = require('../engine/stage-iterative');
  const decision = parseDecision('Accept paper');
  if (decision !== 'Accept') throw new Error(`应返回 Accept，实际 ${decision}`);
});

test('parseDecision 默认返回 Minor', () => {
  const { parseDecision } = require('../engine/stage-iterative');
  const decision = parseDecision('unknown');
  if (decision !== 'Minor') throw new Error(`应返回默认 Minor，实际 ${decision}`);
});

// 测试 routeByDecision
console.log('\n--- routeByDecision ---');

test('routeByDecision 根据决策路由', () => {
  const { routeByDecision } = require('../engine/stage-iterative');
  const routing = {
    severe: 'senior-writer',
    major: 'writer',
    minor: 'editor',
    accept: 'formatter',
  };
  const result = routeByDecision('Major', routing);
  if (result !== 'writer') throw new Error(`应返回 writer，实际 ${result}`);
});

test('routeByDecision 找不到时返回 minor 路由', () => {
  const { routeByDecision } = require('../engine/stage-iterative');
  const routing = { minor: 'editor' };
  const result = routeByDecision('Unknown', routing);
  if (result !== 'editor') throw new Error(`应返回 editor，实际 ${result}`);
});

// 测试 getCheckpointPath
console.log('\n--- checkpoint ---');

test('getCheckpointPath 返回正确路径', () => {
  const { getCheckpointPath } = require('../engine/stage-helpers');
  const path = require('path');
  const projectDir = path.join(__dirname, 'test-project');
  const cpPath = getCheckpointPath(projectDir);
  if (!cpPath.endsWith('pipeline-checkpoint.json')) throw new Error('路径不正确');
  const normalizedProjectDir = path.resolve(projectDir);
  const normalizedCpPath = path.resolve(cpPath);
  if (!normalizedCpPath.startsWith(normalizedProjectDir)) throw new Error('不包含项目目录');
});

// 测试 renderFactCheckReport
console.log('\n--- renderFactCheckReport ---');

test('renderFactCheckReport 生成报告', () => {
  const { renderFactCheckReport } = require('../engine/stage-hooks');
  const report = {
    valid: true,
    totalIssues: 0,
    results: {
      citations: { valid: true, issues: [] },
      dataConsistency: { valid: true, issues: [] },
    },
  };
  const rendered = renderFactCheckReport(report, '/path/to/paper.md');
  if (typeof rendered !== 'string') throw new Error('返回值不是字符串');
  if (!rendered.includes('事实核查报告')) throw new Error('不包含报告标题');
  if (!rendered.includes('通过')) throw new Error('不包含通过状态');
});

// 测试 updateConsistencyMemory
console.log('\n--- updateConsistencyMemory ---');

test('updateConsistencyMemory 函数存在', () => {
  const { updateConsistencyMemory } = require('../engine/stage-helpers');
  if (typeof updateConsistencyMemory !== 'function') throw new Error('updateConsistencyMemory 不是函数');
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

// self-evolution 模块单元测试
console.log('=== self-evolution 模块单元测试 ===\n');

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
  const se = require('../engine/features/self-evolution');
  if (!se) throw new Error('模块加载失败');
  if (!se.FAILURE_PATTERNS) throw new Error('缺少 FAILURE_PATTERNS');
  if (typeof se.extractPatterns !== 'function') throw new Error('缺少 extractPatterns 函数');
  if (typeof se.generateReport !== 'function') throw new Error('缺少 generateReport 函数');
  if (typeof se.applyImprovements !== 'function') throw new Error('缺少 applyImprovements 函数');
  if (typeof se.getHistory !== 'function') throw new Error('缺少 getHistory 函数');
  if (typeof se.saveHistory !== 'function') throw new Error('缺少 saveHistory 函数');
  if (typeof se.recordImprovement !== 'function') throw new Error('缺少 recordImprovement 函数');
  if (typeof se.detectRegressions !== 'function') throw new Error('缺少 detectRegressions 函数');
});

// 测试 FAILURE_PATTERNS
console.log('\n--- FAILURE_PATTERNS ---');

test('FAILURE_PATTERNS 是数组', () => {
  const { FAILURE_PATTERNS } = require('../engine/features/self-evolution');
  if (!Array.isArray(FAILURE_PATTERNS)) throw new Error('FAILURE_PATTERNS 不是数组');
});

test('FAILURE_PATTERNS 包含必需模式', () => {
  const { FAILURE_PATTERNS } = require('../engine/features/self-evolution');
  const patternIds = FAILURE_PATTERNS.map(p => p.id);
  const requiredIds = ['low-r2', 'overfitting', 'no-conclusion', 'no-stats', 'figure-missing', 'enumeration', 'low-score'];
  for (const id of requiredIds) {
    if (!patternIds.includes(id)) throw new Error(`缺少模式: ${id}`);
  }
});

test('FAILURE_PATTERNS 每个模式结构完整', () => {
  const { FAILURE_PATTERNS } = require('../engine/features/self-evolution');
  for (const pattern of FAILURE_PATTERNS) {
    if (!pattern.id) throw new Error('模式缺少 id');
    if (!pattern.detect) throw new Error(`模式 ${pattern.id} 缺少 detect`);
    if (!pattern.severity) throw new Error(`模式 ${pattern.id} 缺少 severity`);
    if (!pattern.suggestion) throw new Error(`模式 ${pattern.id} 缺少 suggestion`);
  }
});

// 测试 extractPatterns
console.log('\n--- extractPatterns ---');

test('extractPatterns 空输入返回空数组', () => {
  const { extractPatterns } = require('../engine/features/self-evolution');
  const result = extractPatterns(null, null);
  if (!Array.isArray(result)) throw new Error('返回值不是数组');
  if (result.length !== 0) throw new Error('空输入应返回空数组');
});

test('extractPatterns 非字符串输入返回空数组', () => {
  const { extractPatterns } = require('../engine/features/self-evolution');
  const result = extractPatterns(123, null);
  if (!Array.isArray(result)) throw new Error('返回值不是数组');
  if (result.length !== 0) throw new Error('非字符串输入应返回空数组');
});

test('extractPatterns 检测 low-r2 模式', () => {
  const { extractPatterns } = require('../engine/features/self-evolution');
  const reviewText = '模型的 R² 只有 0.15，效果不佳';
  const patterns = extractPatterns(reviewText, null);
  const found = patterns.find(p => p.id === 'low-r2');
  if (!found) throw new Error('未检测到 low-r2 模式');
  if (found.severity !== 'high') throw new Error('low-r2 严重度应为 high');
});

test('extractPatterns 检测 overfitting 模式', () => {
  const { extractPatterns } = require('../engine/features/self-evolution');
  const reviewText = '模型存在明显的过拟合问题';
  const patterns = extractPatterns(reviewText, null);
  const found = patterns.find(p => p.id === 'overfitting');
  if (!found) throw new Error('未检测到 overfitting 模式');
});

test('extractPatterns 检测 no-conclusion 模式', () => {
  const { extractPatterns } = require('../engine/features/self-evolution');
  const reviewText = '论文缺少结论章节';
  const patterns = extractPatterns(reviewText, null);
  const found = patterns.find(p => p.id === 'no-conclusion');
  if (!found) throw new Error('未检测到 no-conclusion 模式');
});

test('extractPatterns 检测 no-stats 模式', () => {
  const { extractPatterns } = require('../engine/features/self-evolution');
  const reviewText = '实验缺少统计检验，未报告 p-value';
  const patterns = extractPatterns(reviewText, null);
  const found = patterns.find(p => p.id === 'no-stats');
  if (!found) throw new Error('未检测到 no-stats 模式');
});

test('extractPatterns 检测 figure-missing 模式', () => {
  const { extractPatterns } = require('../engine/features/self-evolution');
  const reviewText = '论文中的图缺失，未找到 includegraphics';
  const patterns = extractPatterns(reviewText, null);
  const found = patterns.find(p => p.id === 'figure-missing');
  if (!found) throw new Error('未检测到 figure-missing 模式');
});

test('extractPatterns 检测 enumeration 模式', () => {
  const { extractPatterns } = require('../engine/features/self-evolution');
  const reviewText = '使用了枚举法进行优化，效率太低';
  const patterns = extractPatterns(reviewText, null);
  const found = patterns.find(p => p.id === 'enumeration');
  if (!found) throw new Error('未检测到 enumeration 模式');
});

test('extractPatterns 低分触发 unknown-failure', () => {
  const { extractPatterns } = require('../engine/features/self-evolution');
  const patterns = extractPatterns('这篇论文一般', null, 5);
  const found = patterns.find(p => p.id === 'unknown-failure');
  if (!found) throw new Error('低分应触发 unknown-failure 模式');
});

test('extractPatterns 高分不触发 unknown-failure', () => {
  const { extractPatterns } = require('../engine/features/self-evolution');
  const patterns = extractPatterns('这篇论文很好', null, 9);
  const found = patterns.find(p => p.id === 'unknown-failure');
  if (found) throw new Error('高分不应触发 unknown-failure 模式');
});

test('extractPatterns 返回的模式结构正确', () => {
  const { extractPatterns } = require('../engine/features/self-evolution');
  const reviewText = 'R² 为 0.1';
  const patterns = extractPatterns(reviewText, null);
  if (patterns.length === 0) throw new Error('应检测到至少一个模式');
  const pattern = patterns[0];
  if (!pattern.id) throw new Error('模式缺少 id');
  if (!pattern.severity) throw new Error('模式缺少 severity');
  if (!pattern.suggestion) throw new Error('模式缺少 suggestion');
  if (!pattern.matched_text) throw new Error('模式缺少 matched_text');
});

// 测试 generateReport
console.log('\n--- generateReport ---');

test('generateReport 空模式生成空报告', () => {
  const { generateReport } = require('../engine/features/self-evolution');
  const report = generateReport([], null);
  if (typeof report !== 'string') throw new Error('返回值不是字符串');
  if (!report.includes('未检测到')) throw new Error('应包含未检测到信息');
});

test('generateReport 生成包含模式信息的报告', () => {
  const { generateReport } = require('../engine/features/self-evolution');
  const patterns = [
    { id: 'low-r2', severity: 'high', suggestion: '使用非线性模型', prompt_target: 'coder.md', inject_text: '测试注入' },
  ];
  const report = generateReport(patterns, null);
  if (typeof report !== 'string') throw new Error('返回值不是字符串');
  if (!report.includes('low-r2')) throw new Error('不包含模式 id');
  if (!report.includes('自进化分析报告')) throw new Error('不包含报告标题');
  if (!report.includes('建议改进操作')) throw new Error('不包含建议改进操作');
});

test('generateReport 按严重度排序', () => {
  const { generateReport } = require('../engine/features/self-evolution');
  const patterns = [
    { id: 'medium-pattern', severity: 'medium', suggestion: 'test', prompt_target: 'writer.md', inject_text: '\n### 测试\n' },
    { id: 'critical-pattern', severity: 'critical', suggestion: 'test', prompt_target: 'writer.md', inject_text: '\n### 测试\n' },
    { id: 'high-pattern', severity: 'high', suggestion: 'test', prompt_target: 'writer.md', inject_text: '\n### 测试\n' },
  ];
  const report = generateReport(patterns, null);
  const tableStart = report.indexOf('| 模式 |');
  const tableEnd = report.indexOf('### 建议改进操作');
  const tableSection = report.substring(tableStart, tableEnd);
  const criticalIdx = tableSection.indexOf('critical-pattern');
  const highIdx = tableSection.indexOf('high-pattern');
  const mediumIdx = tableSection.indexOf('medium-pattern');
  if (criticalIdx === -1 || highIdx === -1 || mediumIdx === -1) throw new Error('表格中缺少模式');
  if (criticalIdx > highIdx) throw new Error('critical 应在 high 之前');
  if (highIdx > mediumIdx) throw new Error('high 应在 medium 之前');
});

// 测试 applyImprovements
console.log('\n--- applyImprovements ---');

test('applyImprovements 空模式返回空数组', () => {
  const { applyImprovements } = require('../engine/features/self-evolution');
  const results = applyImprovements([], {});
  if (!Array.isArray(results)) throw new Error('返回值不是数组');
  if (results.length !== 0) throw new Error('空模式应返回空数组');
});

test('applyImprovements 无目标的模式跳过', () => {
  const { applyImprovements } = require('../engine/features/self-evolution');
  const patterns = [
    { id: 'test-pattern', prompt_target: null, inject_text: null },
  ];
  const results = applyImprovements(patterns, { dryRun: true });
  if (results.length !== 1) throw new Error('应有 1 个结果');
  if (results[0].status !== 'skipped') throw new Error('应跳过无目标模式');
  if (results[0].pattern_id !== 'test-pattern') throw new Error('pattern_id 不匹配');
});

test('applyImprovements dryRun 模式', () => {
  const { applyImprovements } = require('../engine/features/self-evolution');
  const fs = require('fs');
  const path = require('path');
  const tmpDir = path.join(__dirname, 'tmp-prompts');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'writer.md'), '# Writer Prompt\n', 'utf-8');
  
  const patterns = [
    { id: 'test-pattern', prompt_target: 'writer.md', inject_text: '\n### 测试\n' },
  ];
  const results = applyImprovements(patterns, { dryRun: true, promptsDir: tmpDir });
  
  fs.unlinkSync(path.join(tmpDir, 'writer.md'));
  fs.rmdirSync(tmpDir);
  
  if (results.length !== 1) throw new Error('应有 1 个结果');
  if (results[0].status !== 'would_apply') throw new Error('dryRun 状态应为 would_apply');
});

// 测试历史记录功能
console.log('\n--- 历史记录 ---');

test('getHistory 返回默认结构', () => {
  const { getHistory } = require('../engine/features/self-evolution');
  const fs = require('fs');
  const path = require('path');
  const tmpDir = path.join(__dirname, 'tmp-project');
  const openDir = path.join(tmpDir, '.openpip');
  if (!fs.existsSync(openDir)) fs.mkdirSync(openDir, { recursive: true });
  
  const history = getHistory(tmpDir);
  
  fs.rmdirSync(openDir);
  fs.rmdirSync(tmpDir);
  
  if (!history.runs) throw new Error('缺少 runs');
  if (!Array.isArray(history.runs)) throw new Error('runs 不是数组');
  if (!history.improvements_applied) throw new Error('缺少 improvements_applied');
  if (!Array.isArray(history.improvements_applied)) throw new Error('improvements_applied 不是数组');
});

test('detectRegressions 函数存在', () => {
  const { detectRegressions } = require('../engine/features/self-evolution');
  if (typeof detectRegressions !== 'function') throw new Error('detectRegressions 不是函数');
});

test('recordImprovement 函数存在', () => {
  const { recordImprovement } = require('../engine/features/self-evolution');
  if (typeof recordImprovement !== 'function') throw new Error('recordImprovement 不是函数');
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

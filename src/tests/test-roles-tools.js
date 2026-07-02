// roles/tools 模块单元测试
console.log('=== roles/tools 模块单元测试 ===\n');

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

// 测试 python-exec.js 模块
console.log('--- python-exec.js 模块 ---');

test('python-exec.js 导出存在性', () => {
  const pyExec = require('../engine/roles/tools/python-exec');
  if (!pyExec) throw new Error('模块加载失败');
  if (typeof pyExec.executePython !== 'function') throw new Error('缺少 executePython 函数');
  if (typeof pyExec.extractPythonCode !== 'function') throw new Error('缺少 extractPythonCode 函数');
  if (typeof pyExec.validateCode !== 'function') throw new Error('缺少 validateCode 函数');
  if (typeof pyExec.codeExecutionLoop !== 'function') throw new Error('缺少 codeExecutionLoop 函数');
  if (!pyExec.SAFE_IMPORTS) throw new Error('缺少 SAFE_IMPORTS');
});

test('SAFE_IMPORTS 列表完整', () => {
  const { SAFE_IMPORTS } = require('../engine/roles/tools/python-exec');
  if (!Array.isArray(SAFE_IMPORTS)) throw new Error('SAFE_IMPORTS 不是数组');
  const expected = ['numpy', 'scipy', 'pandas', 'matplotlib', 'sklearn', 'json', 'math', 'os', 'sys'];
  for (const imp of expected) {
    if (!SAFE_IMPORTS.includes(imp)) throw new Error(`缺少安全导入: ${imp}`);
  }
});

test('extractPythonCode 从代码块提取', () => {
  const { extractPythonCode } = require('../engine/roles/tools/python-exec');
  const text = '```python\nprint("hello")\nx = 1\n```';
  const code = extractPythonCode(text);
  if (code !== 'print("hello")\nx = 1') throw new Error(`提取结果不正确: ${code}`);
});

test('extractPythonCode 无代码块时返回原文', () => {
  const { extractPythonCode } = require('../engine/roles/tools/python-exec');
  const text = 'print("hello")';
  const code = extractPythonCode(text);
  if (code !== 'print("hello")') throw new Error(`提取结果不正确: ${code}`);
});

test('extractPythonCode 处理无语言标记的代码块', () => {
  const { extractPythonCode } = require('../engine/roles/tools/python-exec');
  const text = '```\nprint("hello")\n```';
  const code = extractPythonCode(text);
  if (code !== 'print("hello")') throw new Error(`提取结果不正确: ${code}`);
});

test('validateCode 安全代码通过', () => {
  const { validateCode } = require('../engine/roles/tools/python-exec');
  const code = 'import numpy as np\nx = np.array([1,2,3])\nprint(x)';
  const result = validateCode(code);
  if (result.safe !== true) throw new Error('安全代码应通过检查');
  if (result.issues.length !== 0) throw new Error('不应有问题');
});

test('validateCode 检测 os.system', () => {
  const { validateCode } = require('../engine/roles/tools/python-exec');
  const code = 'import os\nos.system("rm -rf /")';
  const result = validateCode(code);
  if (result.safe !== false) throw new Error('应检测到不安全操作');
  if (result.issues.length === 0) throw new Error('应有问题列表');
});

test('validateCode 检测 subprocess', () => {
  const { validateCode } = require('../engine/roles/tools/python-exec');
  const code = 'import subprocess\nsubprocess.call(["ls"])';
  const result = validateCode(code);
  if (result.safe !== false) throw new Error('应检测到 subprocess');
});

test('validateCode 检测 eval', () => {
  const { validateCode } = require('../engine/roles/tools/python-exec');
  const code = 'x = eval("1+2")';
  const result = validateCode(code);
  if (result.safe !== false) throw new Error('应检测到 eval');
});

test('validateCode 检测 exec', () => {
  const { validateCode } = require('../engine/roles/tools/python-exec');
  const code = 'exec("x=1")';
  const result = validateCode(code);
  if (result.safe !== false) throw new Error('应检测到 exec');
});

test('validateCode 检测 __import__', () => {
  const { validateCode } = require('../engine/roles/tools/python-exec');
  const code = 'm = __import__("os")';
  const result = validateCode(code);
  if (result.safe !== false) throw new Error('应检测到 __import__');
});

test('validateCode 检测路径穿越', () => {
  const { validateCode } = require('../engine/roles/tools/python-exec');
  const code = 'open("../secret.txt")';
  const result = validateCode(code);
  if (result.safe !== false) throw new Error('应检测到路径穿越');
});

// 测试 executePython 的跨平台命令选择
test('executePython 函数存在', () => {
  const { executePython } = require('../engine/roles/tools/python-exec');
  if (typeof executePython !== 'function') throw new Error('executePython 不是函数');
});

// 测试 local-files.js 模块
console.log('\n--- local-files.js 模块 ---');

test('local-files.js 导出存在性', () => {
  const localFiles = require('../engine/roles/tools/local-files');
  if (!localFiles) throw new Error('模块加载失败');
  if (typeof localFiles.scanProjectFiles !== 'function') throw new Error('缺少 scanProjectFiles 函数');
  if (typeof localFiles.formatFilesContext !== 'function') throw new Error('缺少 formatFilesContext 函数');
  if (!localFiles.SCAN_DIRS) throw new Error('缺少 SCAN_DIRS');
});

test('SCAN_DIRS 配置正确', () => {
  const { SCAN_DIRS } = require('../engine/roles/tools/local-files');
  if (!Array.isArray(SCAN_DIRS)) throw new Error('SCAN_DIRS 不是数组');
  const expected = ['user-input', 'data', 'references'];
  for (const dir of expected) {
    if (!SCAN_DIRS.includes(dir)) throw new Error(`缺少扫描目录: ${dir}`);
  }
});

test('scanProjectFiles 空目录返回空数组', () => {
  const { scanProjectFiles } = require('../engine/roles/tools/local-files');
  const fs = require('fs');
  const path = require('path');
  const tmpDir = path.join(__dirname, 'tmp-test-empty');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const files = scanProjectFiles(tmpDir);
  if (!Array.isArray(files)) throw new Error('返回值不是数组');
  if (files.length !== 0) throw new Error('空目录应返回空数组');
  fs.rmdirSync(tmpDir);
});

test('formatFilesContext 空数组返回空字符串', () => {
  const { formatFilesContext } = require('../engine/roles/tools/local-files');
  const result = formatFilesContext([]);
  if (result !== '') throw new Error('空数组应返回空字符串');
});

test('formatFilesContext 格式化文件列表', () => {
  const { formatFilesContext } = require('../engine/roles/tools/local-files');
  const files = [
    { path: 'data/test.csv', sizeKB: 100, columns: ['a', 'b'], rows: 10, preview: 'a,b\n1,2' },
    { path: 'user-input/notes.md', sizeKB: 50, lines: 20, preview: '# 笔记' },
  ];
  const result = formatFilesContext(files);
  if (typeof result !== 'string') throw new Error('返回值不是字符串');
  if (!result.includes('test.csv')) throw new Error('不包含 CSV 文件名');
  if (!result.includes('notes.md')) throw new Error('不包含 MD 文件名');
  if (!result.includes('数据文件')) throw new Error('不包含数据文件标题');
});

// 测试 arxiv-search.js 模块
console.log('\n--- arxiv-search.js 模块 ---');

test('arxiv-search.js 导出存在性', () => {
  const arxiv = require('../engine/roles/tools/arxiv-search');
  if (!arxiv) throw new Error('模块加载失败');
  if (typeof arxiv.searchArxiv !== 'function') throw new Error('缺少 searchArxiv 函数');
  if (typeof arxiv.formatArxivResults !== 'function') throw new Error('缺少 formatArxivResults 函数');
  if (typeof arxiv.buildQuery !== 'function') throw new Error('缺少 buildQuery 函数');
});

test('buildQuery 基础功能', () => {
  const { buildQuery } = require('../engine/roles/tools/arxiv-search');
  const query = buildQuery('machine learning');
  if (typeof query !== 'string') throw new Error('返回值不是字符串');
  if (!query.includes('all:machine')) throw new Error('不包含 machine 术语');
  if (!query.includes('all:learning')) throw new Error('不包含 learning 术语');
});

test('buildQuery 处理特殊字符', () => {
  const { buildQuery } = require('../engine/roles/tools/arxiv-search');
  const query = buildQuery('hello!@#world');
  if (typeof query !== 'string') throw new Error('返回值不是字符串');
});

test('buildQuery 中文支持', () => {
  const { buildQuery } = require('../engine/roles/tools/arxiv-search');
  const query = buildQuery('深度学习 神经网络');
  if (typeof query !== 'string') throw new Error('返回值不是字符串');
  const terms = query.split('+AND+');
  if (terms.length !== 2) throw new Error(`应有 2 个术语，实际 ${terms.length}`);
  if (!query.includes('all:')) throw new Error('不包含 all: 前缀');
});

test('formatArxivResults 失败结果格式化', () => {
  const { formatArxivResults } = require('../engine/roles/tools/arxiv-search');
  const result = { success: false, error: '网络错误' };
  const formatted = formatArxivResults(result);
  if (typeof formatted !== 'string') throw new Error('返回值不是字符串');
  if (!formatted.includes('失败')) throw new Error('应包含失败信息');
});

test('formatArxivResults 空结果格式化', () => {
  const { formatArxivResults } = require('../engine/roles/tools/arxiv-search');
  const result = { success: true, papers: [], totalResults: 0 };
  const formatted = formatArxivResults(result);
  if (typeof formatted !== 'string') throw new Error('返回值不是字符串');
  if (!formatted.includes('为空')) throw new Error('应包含为空信息');
});

test('formatArxivResults 成功结果格式化', () => {
  const { formatArxivResults } = require('../engine/roles/tools/arxiv-search');
  const result = {
    success: true,
    papers: [
      { title: 'Test Paper', authors: 'Author A, Author B', published: '2024-01-01', summary: '摘要...', link: 'http://example.com', category: 'cs.AI' },
    ],
    totalResults: 100,
  };
  const formatted = formatArxivResults(result);
  if (typeof formatted !== 'string') throw new Error('返回值不是字符串');
  if (!formatted.includes('Test Paper')) throw new Error('不包含论文标题');
  if (!formatted.includes('检索结果')) throw new Error('不包含检索结果标题');
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

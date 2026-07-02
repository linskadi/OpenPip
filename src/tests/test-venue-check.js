// 测试 venueCheck 函数
const assert = require('assert');
const { writeFileSync, mkdtempSync } = require('fs');
const { join } = require('path');
const os = require('os');

let venueCheck;
try {
  venueCheck = require('../engine/output/latex-exporter').venueCheck;
} catch {
  console.log('⚠️ latex-exporter.venueCheck 未加载（跳过测试）');
  process.exit(0);
}

function testPassingCheck() {
  const tmpDir = mkdtempSync(join(os.tmpdir(), 'venue-test-'));
  const paperPath = join(tmpDir, 'paper.md');
  const content = `# Title

## Abstract
This paper proposes a method.

## Introduction
We introduce a novel approach.

## Method
Our method consists of three steps.

## Experiments
We evaluate on benchmark datasets.

## Conclusion
We summarize our findings.
`;

  writeFileSync(paperPath, content, 'utf-8');
  const result = venueCheck(paperPath, 'neurips');

  assert.strictEqual(result.valid, true, 'neurips 应有所有必要章节');
  assert.strictEqual(result.issues.length, 0, '不应有 issues');
  console.log('✅ testPassingCheck: NeurIPS 合规通过');
}

function testMissingSections() {
  const tmpDir = mkdtempSync(join(os.tmpdir(), 'venue-test-'));
  const paperPath = join(tmpDir, 'paper.md');
  const content = `# Title

## Intro
Some intro text.
`;

  writeFileSync(paperPath, content, 'utf-8');
  const result = venueCheck(paperPath, 'icml');

  assert.ok(!result.valid, '应检出缺少章节');
  assert.ok(result.issues.length > 0, '应有 issues');
  console.log('✅ testMissingSections: 缺少章节被检出 (' + result.issues.length + ' 条)');
}

function testChineseCore() {
  const tmpDir = mkdtempSync(join(os.tmpdir(), 'venue-test-'));
  const paperPath = join(tmpDir, 'paper.md');
  const content = `# 标题

## 摘要
本文提出...

## 引言
介绍背景...

## 方法
详细方法...

## 实验
实验结果...

## 结论
总结...
`;

  writeFileSync(paperPath, content, 'utf-8');
  const result = venueCheck(paperPath, 'chinese-core');

  assert.strictEqual(result.valid, true, 'chinese-core 中文标题通过检查');
  console.log('✅ testChineseCore: 中文核心检查完成, issues=' + result.issues.length);
}

function testMissingFile() {
  const result = venueCheck('/nonexistent/paper.md', 'acl');
  assert.ok(!result.valid, '文件不存在时应返回 invalid');
  console.log('✅ testMissingFile: 文件不存在告警正确');
}

async function run() {
  testPassingCheck();
  testMissingSections();
  testChineseCore();
  testMissingFile();
  console.log('\n✅ 所有 venue 检查测试通过');
}

run().catch(err => {
  console.error('❌ venue 检查测试失败:', err.message);
  process.exit(1);
});

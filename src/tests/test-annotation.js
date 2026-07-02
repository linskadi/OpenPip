const assert = require('assert');
const { parseAnnotations } = require('../engine/features/annotation');

const testText = `# 第1章 绪论

## 1.1 研究背景

无线通信技术快速发展。<!-- TODO: 补充5G/6G发展数据 -->

本文研究了深度学习方法。<!-- FIXME: 这里需要更详细的说明 -->

## 1.2 研究现状

已有研究取得了进展。<!-- NOTE: 可以引用更多文献 -->
`;

console.log('=== 批注解析测试 ===\n');
const annotations = parseAnnotations(testText);
console.log(`发现 ${annotations.length} 条批注:\n`);
for (const a of annotations) {
  console.log(`[${a.type}] 第${a.line}行 → ${a.agent}`);
  console.log(`  ${a.content}\n`);
}

assert.ok(annotations.length === 3, `应解析出 3 条批注，实际 ${annotations.length}`);
assert.ok(annotations.some(a => a.type === 'todo'), '应包含 TODO 批注');
assert.ok(annotations.some(a => a.type === 'fixme'), '应包含 FIXME 批注');

console.log('✅ 测试通过');

const assert = require('assert');
const { parseReviewIssues } = require('../engine/review/review-loop');

console.log('=== 评审闭环测试 ===\n');

// 使用内联审稿文本，匹配 review-loop.js 的解析格式
const sampleReview = `
### 意见1：[严重程度：高]
**位置**：引言
**问题**：创新性描述不够具体
**建议**：明确阐述与现有工作的区别

### 意见2：[严重程度：中]
**位置**：实验部分
**问题**：对比实验不够充分
**建议**：增加SOTA方法对比
`;

const comments = parseReviewIssues(sampleReview);
console.log(`解析到 ${comments.length} 条意见:\n`);
for (const c of comments) {
  console.log(`[${c.severity}] ${c.agent}`);
  console.log(`  问题: ${(c.problem || c.description || '').substring(0, 80)}`);
  console.log(`  建议: ${(c.suggestion || '').substring(0, 80)}`);
  console.log();
}

assert.ok(comments.length >= 2, `应解析出至少 2 条意见，实际 ${comments.length}`);

console.log('✅ 测试通过');

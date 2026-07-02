const assert = require('assert');
const { buildKnowledgeIndex, searchKnowledge } = require('../engine/knowledge/knowledge-rag');
const { resolve } = require('path');

const knowledgeDir = resolve(__dirname, '..', '..', '.openpip', 'knowledge');

console.log('=== 构建知识索引 ===');
const index = buildKnowledgeIndex(knowledgeDir);
console.log(`索引文档数: ${index.documents.length}`);
console.log(`词汇表大小: ${index.vocab.size}`);

assert.ok(index.documents.length > 0, '应至少索引一个文档');
assert.ok(index.vocab.size > 0, '词汇表不应为空');

console.log('\n=== 测试检索 ===');
const queries = ['如何进行学术写作', 'GB/T 7714 参考文献格式', '实验设计方法', '禁用词有哪些'];

let totalResults = 0;
for (const query of queries) {
  console.log(`\n查询: ${query}`);
  const results = searchKnowledge(index, query, 3);
  for (const r of results) {
    console.log(`  - ${r.metadata.file} (相关度: ${(r.score * 100).toFixed(1)}%)`);
    console.log(`    ${r.text.substring(0, 80)}...`);
  }
  totalResults += results.length;
}

assert.ok(totalResults > 0, '至少一个查询应返回结果');

console.log('\n✅ 测试通过');

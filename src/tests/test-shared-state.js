const assert = require('assert');
const { mkdtempSync } = require('fs');
const { join } = require('path');
const os = require('os');
const { initBlackboard, sliceFor, saveBlackboard, loadBlackboard } = require('../engine/state/shared-state');

function testSlice() {
  const dir = mkdtempSync(join(os.tmpdir(), 'op-'));
  initBlackboard(dir);
  const bb = loadBlackboard(dir);
  bb.outline = { title: 'T', chapters: [{ id: 1 }] };
  bb.draft.full = '正文内容';
  saveBlackboard(dir, bb);

  // writer polish 子任务：只拿 draft，不拿 outline
  const writerSlice = sliceFor('writer', 'polish', bb);
  assert.strictEqual(writerSlice.draft, '正文内容', 'writer polish 应只拿 draft');
  assert.strictEqual(writerSlice.outline, undefined, 'polish 不应拿 outline');

  // writer draft 子任务：拿 outline + memory，不拿 draft 全文
  const writerDraftSlice = sliceFor('writer', 'draft', bb);
  assert.ok(writerDraftSlice.outline, 'draft 应拿 outline');
  assert.strictEqual(writerDraftSlice.draft, undefined, 'draft 不应拿 draft 全文');

  // reviewer：只拿 draft + memory，不拿 outline
  const reviewerSlice = sliceFor('reviewer', null, bb);
  assert.strictEqual(reviewerSlice.draft, '正文内容');
  assert.strictEqual(reviewerSlice.outline, undefined, 'reviewer 不应拿 outline');

  // planner：只拿 mode + research，不拿 draft
  const plannerSlice = sliceFor('planner', null, bb);
  assert.strictEqual(plannerSlice.research, bb.research);
  assert.strictEqual(plannerSlice.draft, undefined, 'planner 不应拿 draft');

  // formatter：只拿 draft + memory
  const formatterSlice = sliceFor('formatter', 'format', bb);
  assert.strictEqual(formatterSlice.draft, '正文内容');
  assert.strictEqual(formatterSlice.outline, undefined, 'formatter 不应拿 outline');

  console.log('✅ testSlice 通过：所有切片隔离正确');
}

function testPersistence() {
  const dir = mkdtempSync(join(os.tmpdir(), 'op2-'));
  const bb1 = initBlackboard(dir);
  bb1.topic = '测试主题';
  saveBlackboard(dir, bb1);

  const bb2 = loadBlackboard(dir);
  assert.strictEqual(bb2.topic, '测试主题', '黑板应持久化');
  assert.ok(bb2.meta.updatedAt, 'updatedAt 应被写入');
  console.log('✅ testPersistence 通过：黑板持久化正确');
}

testSlice();
testPersistence();
console.log('\n全部测试通过');

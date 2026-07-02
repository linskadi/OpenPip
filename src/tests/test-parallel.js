const { getExecutionGroups, getDependencies } = require("../engine/pipeline")

const testStages = [
  { id: "research", output: "research/research-brief.md" },
  { id: "skeleton", input: { brief: "research/research-brief.md" }, output: "drafts/outline-v1.md" },
  { id: "draft", input: { outline: "drafts/outline-v1.md", memory: "drafts/consistency-memory.md" }, output: "drafts/draft-v1.md" },
  { id: "polish", input: { draft: "drafts/draft-v1.md" }, output: "drafts/draft-v2.md" },
  { id: "format", input: { draft: "drafts/draft-v2.md" }, output: "output/paper.md" },
  { id: "integrity", input: { draft: "drafts/draft-v2.md" }, output: "output/integrity-report.md" },
  { id: "review", input: { draft: "output/paper.md", integrity: "output/integrity-report.md" }, output: "output/review-report.md" },
]

console.log("=== 依赖分析 ===")
for (const stage of testStages) {
  const deps = getDependencies(stage, testStages)
  console.log(`  ${stage.id} → 依赖: [${deps.join(", ")}]`)
}

console.log("\n=== 执行分组（拓扑排序）===")
const groups = getExecutionGroups(testStages)
for (let i = 0; i < groups.length; i++) {
  console.log(`  Group ${i + 1}: ${groups[i].map(s => s.id).join(", ")}`)
}

console.log("\n=== 预期结果 ===")
console.log("  Group 1: research          (无依赖)")
console.log("  Group 2: skeleton          (依赖 research)")
console.log("  Group 3: draft             (依赖 skeleton)")
console.log("  Group 4: polish            (依赖 draft)")
console.log("  Group 5: format, integrity (并行，都依赖 polish)")
console.log("  Group 6: review            (依赖 format + integrity)")

const expected = [
  ["research"],
  ["skeleton"],
  ["draft"],
  ["polish"],
  ["format", "integrity"],
  ["review"],
]

let passed = true
if (groups.length !== expected.length) {
  console.log(`\n❌ FAIL: 预期 ${expected.length} 组，实际 ${groups.length} 组`)
  passed = false
} else {
  for (let i = 0; i < expected.length; i++) {
    const actual = groups[i].map(s => s.id).sort()
    const exp = expected[i].sort()
    if (JSON.stringify(actual) !== JSON.stringify(exp)) {
      console.log(`\n❌ FAIL: Group ${i + 1} 预期 [${exp.join(", ")}]，实际 [${actual.join(", ")}]`)
      passed = false
    }
  }
}

if (passed) {
  console.log("\n✅ 所有测试通过！拓扑排序正确。")
} else {
  console.log("\n❌ 部分测试失败。")
  process.exit(1)
}

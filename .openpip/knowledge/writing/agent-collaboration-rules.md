# Agent 协作规范

## 信息传递规范

### 数据传递协议（黑板共享状态）

Agent 间通过 **`state/blackboard.json` 黑板**传递结构化切片字段，**禁止依赖全历史对话**。每个 agent 只接收当前 subtask 所需字段（由 `sliceFor` 注入）。

| 传递内容 | 黑板字段 | 切片规则 |
|---------|---------|---------|
| 文献调研结果 | `research.brief`, `research.refs` | planner/writer 仅读 brief |
| 大纲结构 | `outline.title`, `outline.chapters` | writer/reviewer 按需读 |
| 正文章节 | `draft.full`, `draft.summary` | polish 子任务只读 full；reviewer 只读 full |
| 一致性记忆 | `memory.terms`, `memory.refs`, `memory.symbols` | writer 按需读 |
| 审稿意见 | `review.score`, `review.decision`, `review.issues` | writer polish 子任务读 issues |
| 完整性校验 | `integrity.refs/formulas/figures/terms` | reviewer 写入，不读 |

### 传递规则

1. **切片最小化**：只注入当前 subtask 所需字段，不传全黑板
2. **上游产物必须完整**：不能假设下游能访问上游中间状态
3. **版本标注**：输出文件名含版本号（`draft-v1.md`、`outline-v1.md`）
4. **状态同步**：每阶段完成后写回黑板对应字段

---

## 交接输出格式

### 标准输出结构

每个 Agent 交付物包含元信息：

```markdown
<!-- Agent: {agent_name} -->
<!-- Subtask: {subtask} -->
<!-- Version: {version} -->
<!-- Status: draft|final|revision -->

{正文内容}
```

### 各 Agent 交付物规范（7-agent 精简版）

| Agent | subtask | 交付物 | 必含字段 |
|-------|---------|--------|---------|
| researcher | - | `research-brief.md` | 选题背景、文献列表(≥15篇)、研究空白、建议方向 |
| planner | research/competition | `outline-v{N}.md` (JSON) | mode, title, chapters[{id,name,goal,sections,key_refs}] |
| writer | draft | `draft-v{N}.md` | 正文、公式编号、图表引用、交叉引用 |
| writer | polish | `draft-v{N+1}.md` | 修改标注、去AI痕迹说明、术语一致性 |
| writer | summary | `summary.md` | 目的/方法/结果/结论，150-300字 |
| writer | competition-draft | `draft-v{N}.md` | 竞赛正文（含模型假设、符号说明、求解过程） |
| coder | - | `notebook.ipynb` | 模型代码、结果图表、敏感性分析 |
| reviewer | research/competition | `review-report.md` | 评分0-100、决策、3-5条意见、完整性附录 |
| formatter | format | `paper.md` | 格式合规、GB/T 7714 参考文献、公式编号修正 |
| formatter | figure | `figures/*.py` | matplotlib/TikZ 可执行代码 |
| formatter | export | `latex/paper.tex` | LaTeX 源码 + 编译 PDF |

---

## 超范围标注

当 Agent 发现超出自身职责范围的问题时，使用标准标注：

```markdown
<!-- OUT_OF_SCOPE: {scope_type} -->
<!-- 描述: {问题描述} -->
<!-- 建议Agent: {应处理此问题的Agent名} -->
<!-- 优先级: {高/中/低} -->
```

### 标注示例

```markdown
<!-- OUT_OF_SCOPE: methodology -->
<!-- 描述: 公式(3)推导存在数学错误，需重新推导 -->
<!-- 建议Agent: writer -->
<!-- 优先级: 高 -->

<!-- OUT_OF_SCOPE: reference -->
<!-- 描述: 缺少2024年最新相关工作引用 -->
<!-- 建议Agent: researcher -->
<!-- 优先级: 中 -->

<!-- OUT_OF_SCOPE: format -->
<!-- 描述: 参考文献格式不符合GB/T 7714-2015 -->
<!-- 建议Agent: formatter -->
<!-- 优先级: 低 -->
```

### 标注规则

1. **标注不修改原文**：发现问题时只标注，不自行修改
2. **标注必须具体**：指明具体位置（章节/段落/公式）
3. **优先级准确**：方法错误=高，引用缺失=中，格式问题=低

---

## 禁止越权清单（7-agent 版）

| Agent | 禁止行为 | 正确做法 |
|-------|---------|---------|
| researcher | 直接撰写论文正文 | 输出调研简报，交给 planner 和 writer |
| planner | 修改已有正文内容 | 只输出大纲结构，不触碰正文 |
| writer (draft) | 跳过大纲直接撰写 | 严格按 outline 执行 |
| writer (polish) | 修改方法论或公式 | 只修改表达，不改变技术内容 |
| coder | 修改论文正文 | 只输出代码与结果，正文交 writer |
| formatter | 修改论文逻辑结构 | 只做格式调整，不动内容逻辑 |
| reviewer | 直接修改论文 | 输出审稿意见（含完整性附录），交由 writer 处理 |
| reviewer | 替代 writer 做润色 | 只评审，不修改原文 |

### 越权处理流程

发现越权操作时：
1. 记录到 `review-report.md` 的「协作违规」附录
2. 回滚越权修改（如有版本快照则恢复）
3. 将任务重新分发给正确的 Agent

---

## 常见协作错误示例

### 错误1：隐式上下文依赖

```markdown
# ❌ 错误示例
Agent B 输出："继续之前的工作，补充更多细节"

# ✅ 正确做法
Agent B 输出："针对 [黑板 outline.chapters[2]] 中第3章的方法设计，补充以下细节：..."
```

**问题**：下游 Agent 假设上游已理解上下文，但黑板只传切片字段。

### 错误2：职责边界模糊导致重复修改

```markdown
# ❌ 错误示例
writer (polish) 修改了公式编号，formatter 又改回来

# ✅ 正确做法
writer (polish) 只标注 "公式编号格式需修正"，formatter (format) 统一处理格式问题
```

**问题**：writer 的 polish 子任务越权做了 formatter 的工作，导致返工。

### 错误3：输出格式不一致导致解析失败

```markdown
# ❌ 错误示例
planner 输出：`1. 引言\n2. 方法\n3. 实验`
writer 期望 JSON：`{"chapters":[{"id":1,"name":"引言"}]}`

# ✅ 正确做法
planner 输出 JSON 结构化大纲（见 planner.md 输出契约）
```

**问题**：格式不一致导致 writer 无法正确解析 outline。

### 错误4：引用丢失

```markdown
# ❌ 错误示例
writer (draft) 撰写时引用了文献 [1]-[5]，writer (polish) 润色时删除了引用

# ✅ 正确做法
writer (polish) 标注 "第2段删除了引用 [3]，请确认是否必要"，不直接删除
```

**问题**：润色过程丢失了关键引用，违反学术规范。

### 错误5：版本混乱

```markdown
# ❌ 错误示例
同时存在 draft-v1.md、draft-v1.1.md、draft-final.md，不知道哪个是最新的

# ✅ 正确做法
版本号递增：draft-v1 → draft-v2（polish 产物）
每次修改只创建新版本，不覆盖旧版本
```

**问题**：版本管理混乱导致修改丢失或覆盖。

---

## 协作检查清单

每个 Agent 在输出前必须自查：

- [ ] 输出文件名包含版本号
- [ ] 引用文献格式完整（GB/T 7714-2015）
- [ ] 变量首次出现有定义
- [ ] 超范围问题已标注（如有）
- [ ] 输出格式符合 subtask 契约
- [ ] 未修改超出职责范围的内容
- [ ] 黑板字段已正确写回

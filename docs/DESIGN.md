# OpenPip 设计文档

> v0.1.0 — 开源学术写作工作流引擎
> 最后更新：2026-06-30

---

## 一、项目定位

### 1.1 核心定位

OpenPip 是一个**开源学术写作工作流引擎**。

它编排多角色协作流程，内置质量门禁与多轮评审，自动生成符合学术规范的论文。

**不是什么**：
- ❌ 不是 Agent 框架（没有自主决策、工具调用循环）
- ❌ 不是 MCP 服务器
- ❌ 不是 opencode 的子模块

**是什么**：
- ✅ 学术论文领域的工作流编排引擎
- ✅ 角色化提示词 + 流水线调度 + 质量门禁
- ✅ 独立 Node.js 应用，可被 CLI / npm API / opencode skill 调用

### 1.2 与外部工具的关系

| 层面 | 外部提供 | OpenPip 自己做 |
|------|---------|---------------------|
| LLM 调用 | API 接入、模型切换 | 不涉及（直接用） |
| 工具执行 | bash、read、write、edit | 不涉及（直接用） |
| **角色定义** | 不涉及 | **自己的 YAML 格式** |
| **调度逻辑** | 不涉及 | **自己的流水线编排器** |
| **知识体系** | 不涉及 | **自己的知识库 + RAG** |
| **论文工具** | 不涉及 | **自己的质量/评审/导出** |
| **开发者体验** | 不涉及 | **自己的 CLI / TUI / 配置** |

---

## 二、核心架构设计

### 2.1 分层架构

```
┌─────────────────────────────────────────┐
│  CLI 层 (bin/)                          │  13 个命令：config/init/new/run/chat/evolve/annotate/agent/doctor/export/index/status/tui
├─────────────────────────────────────────┤
│  适配器层 (src/adapters/)               │  CLI / Agent
├─────────────────────────────────────────┤
│  核心引擎层 (src/engine/)               │
│  ┌─────────┬─────────┬──────────────┐ │
│  │  流水线  │  角色调度 │  质量保障     │ │
│  │ 编排执行 │  + 黑板  │  + 评审       │ │
│  ├─────────┴─────────┴──────────────┤ │
│  │  知识管理 / LLM 调用 / 输出生成   │ │
│  └──────────────────────────────────┘ │
├─────────────────────────────────────────┤
│  Post-stage Hooks (src/engine/stage-hooks.js) │  事实校验 / 反向大纲 / 数据溯源
├─────────────────────────────────────────┤
│  配置与数据                             │
│  openpip.config.json            │  用户级：API Key、模型选择
│  .openpip/                      │  系统级：role-configs/role-prompts/pipelines/knowledge
└─────────────────────────────────────────┘
```

### 2.2 设计原则

| 原则 | 实现 |
|------|------|
| **最简优先** | 能用 workflow 就不用动态调度，能用提示词就不用工具调用 |
| **学术实证驱动** | 角色数量、黑板设计、HIL 确认点均来自前沿学术文献 |
| **容错优先** | LLM 多层重试+降级，黑板兜底初始化，Hook 失败不阻塞 |
| **版本化演进** | 黑板 v1→v2→v3 自动迁移，所有关键数据结构带版本号 |
| **编排执行分离** | pipeline.js（编排）+ stage-executor.js（执行），清晰解耦 |
| **渐进式增强** | DI 容器/结构化日志等基础设施先就绪，再逐步接入 |

---

## 三、角色体系（10 个角色）

### 3.1 角色团队

| 角色 | 职责 | 模型分层 | 合并来源 |
|------|------|---------|---------|
| orchestrator | 总控调度（workflow 优先） | L0 | 保留 |
| researcher | 文献调研 | L1 | 保留 |
| planner | 大纲设计（research/competition 双模式） | L1 | skeleton + competition-skeleton |
| writer | 正文撰写/润色/摘要（subtask 切换） | L1 | writer + polisher + summarizer + competition-writer |
| coder | 竞赛建模代码（可选） | L1 | 新增 |
| reviewer | 终审 + 完整性（ensemble 5×5 + reflection） | L2 | reviewer + reviewer-research + reviewer-competition + integrity + competition-reviewer |
| formatter | 格式/绘图/导出（subtask 切换） | L0 | formatter + figure + export |
| code-reviewer | 代码审查（4 维度：安全/质量/规范/建议） | L1 | 新增（code-review 管线） |
| contribution-architect | 贡献提炼与论证架构 | L1 | 新增 |
| adversarial-researcher | 对抗性研究/反驳挖掘 | L2 | 新增 |

**设计依据**：
- MathModelAgent：3 角色通吃竞赛，workflow agentless 降本
- Agent Laboratory (arXiv:2501.04227)：6-7 角色成本降 84%，HIL > 自主模式
- Google DeepMind Scaling Law：3-4 agent 甜点区，10+ 暴跌 70%
- Anthropic Building Effective Agents：最简优先

### 3.2 角色定义格式

角色配置使用 YAML（`.openpip/role-configs/<name>.yaml`），提示词使用纯 Markdown（`.openpip/role-prompts/<name>.md`）。

```yaml
# 角色配置示例
name: writer
model: deepseek/deepseek-chat
temperature: 0.7
topP: 0.9
knowledge:
  - writing/academic-style.md
  - format/formula.md
```

> **注意**：术语上，内部代码仍使用 `agent` 作为变量名（向后兼容），对外文档统一使用"角色"或"Role"。

---

## 四、流水线体系

### 4.1 管线模板（9 个 yaml）

| 管线 | 用途 | 说明 |
|--------|------|------|
| lightweight | 轻量级写作 | 精简阶段，快速产出 |
| full-research | 完整研究论文 | 通用论文写作全流程 |
| full-paper | full-research 别名 | 指向 full-research，向后兼容 |
| research-cs | 计算机科学论文 | 面向 CS 领域研究论文 |
| code-review | 代码审查 | 5 阶段：扫描→安全→质量→建议→报告 |
| competition-math-modeling | 数学建模竞赛 | 竞赛论文全流程 |
| competition-data-science | 数据竞赛 | 数据科学竞赛论文 |
| competition-general | 通用竞赛 | 通用竞赛论文模板 |
| iterative-optimization | 迭代优化 | 多轮迭代优化流程 |

### 4.2 流水线格式

```yaml
# .openpip/pipelines/full-paper.yaml
stages:
  - id: research
    agent: researcher
    output: research/research-brief.md
    approval:
      previewLines: 30
      maxFeedbackRounds: 3

  - id: skeleton
    agent: planner
    task_prefix: "mode: research"
    input:
      brief: research/research-brief.md
    output: drafts/outline-v1.md

  - id: draft
    agent: writer
    task_prefix: "subtask: draft"
    mode: sequential
    chapters: [1, 2, 3, 4, 5]

  - id: review
    agent: reviewer
    ensemble: true

  - id: revise
    agent: writer
    task_prefix: "subtask: polish"
    condition: "review.decision != 'Accept'"
```

### 4.3 执行流程

```
用户输入选题
  ↓
Pipeline Runner
  ├─ 逐阶段执行
  ├─ 每个 Stage 完成后 → 用户审批门禁
  │     ├─ [确认] → 进入下一阶段
  │     ├─ [反馈] → 解析意见 → 重新生成 → 再展示 → 循环
  │     ├─ [编辑] → 手动编辑 → 保存后继续
  │     └─ [中止] → 结束
  ├─ Post-stage Hooks（不阻塞主流程）
  │     ├─ FactVerifier（引用/数据/来源/幻觉四合一）
  │     ├─ ReverseOutlineVerifier（大纲偏离度）
  │     └─ ConsistencyChecker（术语/变量/引用）
  └─ VersionManager.autoSnapshot（每阶段快照）
  ↓
最终输出：papers/{project}/output/paper.md + LaTeX/PDF
```

---

## 五、黑板共享状态（Blackboard v4）

### 5.1 设计理念

**传切片不传全量** — 每个角色只读取自己需要的字段，节省 ~61% token（腾讯 Agent Memory 实证）。

### 5.2 Schema v4

```javascript
{
  meta: { version: 4, topic, mode, createdAt, targetVenue, modelTier },
  research: { brief, sources[], contribution, dimensions{} },
  outline: { title, chapters[] },
  draft: {
    full, summary, code,
    chapters: [              // v3 新增：逐章独立存储
      { index, title, content, wordCount, status },
      ...
    ]
  },
  memory: { consistency, ragContext, costLedger, gapAnalysis },
  review: { score, decision, issues[], detailedIssues[] },
  composition: { phases[], currentIndex },
  integrity: {},
  classification: { firstClass, subClass },  // v4 新增：分类信息
  history: [ ... ]          // 上限 50 条，前 10 条完整，其余折叠
}
```

### 5.3 字段权限白名单

| 角色 / 子任务 | 可读字段 | 可写字段 |
|--------------|---------|---------|
| researcher | topic | research |
| planner | research | outline |
| writer:draft | outline, memory | draft, draft.chapters[] |
| writer:polish | draft, memory, review | draft, draft.chapters[] |
| reviewer | draft, research | review |
| coder | outline | draft.code |
| formatter:format | draft | draft.full |

### 5.4 核心操作

- `sliceFor(agentName, subtask)` — 按权限裁剪注入字段
- `writeField(agent, path, value)` — 受白名单约束的受控写入
- `appendHistory()` / `compressHistory()` — 历史管理，超过 10 条触发压缩
- `migrateBlackboard()` — v1 → v2 → v3 → v4 自动迁移

---

## 六、质量保障体系（8 层防线）

| 防线 | 模块 | 检查内容 | 触发时机 |
|------|------|---------|---------|
| 第1层 | quality-check.js | 禁用词（70+条）、术语一致、公式编号、引用密度、字数门槛 | 每阶段输出后 |
| 第2层 | chapter-self-critic.js | 字数溢出、over-claiming、引用格式 GAP、contribution 对齐 | 每章完成后 |
| 第3层 | reverse-outline.js | 反向大纲 vs 原始大纲，检测偏离/缺失/冗余 | draft 阶段后 |
| 第4层 | consistency-checker.js | 跨章节术语/变量/引用一致性 | 多阶段后综合校验 |
| 第5层 | fact-verifier.js | 悬空引用/数据一致性/无来源论断/幻觉（四合一） | review 阶段后 |
| 第6层 | anti-sycophancy.js | 反驳让步阈值评估、确认语句清洗、框架锁定检测 | Ensemble 评审中 |
| 第7层 | argumentation-checker + narrative-checker | 谬误检测（8种）、叙事断裂（5项） | 终审阶段 |

> 注：原设计的 academic-compliance.js（跨章节论点冲突）计划中未实现，由第4/5层共同覆盖部分功能。

---

## 七、Ensemble 评审引擎

### 7.1 审稿风格（7 种）

| 风格 | 类型 | 特征 | 适用场景 |
|------|------|------|---------|
| strict | 通用 | 严格批判，分数偏低 (bias=-5) | 期刊投稿预审 |
| lenient | 通用 | 宽松包容，分数偏高 (bias=+3) | 草稿阶段快速反馈 |
| method | 通用 | 方法论导向，关注实验设计 | 工程技术论文 |
| writing | 通用 | 写作质量导向，关注表达清晰度 | 非母语作者论文 |
| contribution | 专项 | 验证贡献声明与实验证据一致性 | 贡献提炼 |
| devil | 专项 | 主动寻找拒稿理由 | 预审漏洞挖掘 |
| domain | 专项 | 领域知识深度验证 | 专业高度论文 |

### 7.2 评审流程

```
启动 Ensemble
  → N 路并行审稿（每路随机风格轮转 + external persona 合并）
  → 每路最多 R 次自我反思迭代
  → 收集所有评审结果
  → AntiSycophancyChecker 过滤高风险评审 (riskScore ≥ 3 剔除)
  → Venue 特定权重汇总
  → 合并：中位数分数 + 多数决策
  → 生成统一评审报告
```

---

## 八、知识管理系统

### 8.1 知识分类

```
.openpip/knowledge/
├── terminology.md              # 术语表（中英文对照）
├── writing/                     # 学术写作规范（5 文件）
├── format/                      # 格式规范（2 文件）
├── methodology/                 # 研究方法（2 文件）
├── figure/                      # 图表规范（3 文件）
├── competition/                 # 竞赛规范（4 文件）
└── reviewer-personas/           # 外部审稿人风格
```

### 8.2 加载策略

- **全量注入**：核心规则（terminology、academic-style、forbidden-words）每次注入（约 20% token 预算）
- **按需检索**：领域知识通过 TF-IDF 检索 Top-K 相关片段（节省 ~80% token）
- **混合模式**：`loadKnowledgeHybrid()` = 核心规则全量 + 领域知识 RAG

---

## 九、关键设计决策

### 9.1 不做真 Agent

角色是**角色化提示词模板**，不是有工具调用和自主决策的 AI Agent。这不是缺陷，是设计选择。

```
引擎做控制：定序、条件跳转、并行、重试、质量检查
LLM 做生成：只负责产出内容，不决定下一步做什么
用户做审批：每步结果展示给用户，确认后才继续
```

### 9.2 用户审批每步输出

从"用户确认阶段开始"升级为"用户审批阶段结果"：

```
Stage 执行 → 展示输出 → 用户选择:
  ├─ 确认 → 继续下一步
  ├─ 指出问题 → AI 修改 → 再展示 → 循环
  ├─ 手动编辑 → 保存后继续
  └─ 中止 → 结束
```

### 9.3 工具调用由引擎控制

```
引擎决定"当前 stage 需要调工具"
  → 拼装 messages + tools
  → LLM 返回 tool_calls
  → 引擎执行
  → 结果送回 LLM
  → LLM 生成最终输出
```

工具调用只在特定场景启用：
- researcher + literature-review → arxiv-search
- coder + competition-code → python-exec

### 9.4 Rust TUI + JSON-RPC IPC

> ⚠️ 以下架构为规划中，尚未实现（Rust TUI、ipc/ 层、Docker 均未落地）。

界面采用 Rust TUI (ratatui) + JSON-RPC over stdin/stdout 双进程架构：

```
Rust TUI 进程 (界面)
  │  stdin/stdout JSON-RPC
  ▼
Node.js 进程 (引擎)
```

选择理由：
- TUI 轻量、跨平台、零安装包膨胀
- ratatui 是 Rust 生态最成熟的 TUI 框架
- JSON-RPC over stdin/stdout 是最简单的 IPC 方式
- 双进程隔离界面和引擎，未来迁移到 Tauri/Electron 时只需替换前端

---

## 十、模型分层路由（L0-L3）

| 层级 | 模型 | 适用角色 |
|------|------|---------|
| L0 (快效) | DeepSeek V4 Flash / Qwen 2.5 14B | orchestrator, formatter |
| L1 (进阶) | DeepSeek V4 / Qwen 2.5 72B | researcher, planner, writer, coder |
| L2 (专业) | Claude 3.5 Sonnet / GPT-4o Mini | reviewer |
| L3 (旗舰) | GPT-4o / Claude 3.5 Opus | 最终终审（按需启用） |

---

## 十一、期刊自适应（5 个 Venue Profile）

| Venue | 类型 | 特点 |
|-------|------|------|
| NeurIPS | 机器学习顶会 | 8 页限制，强调实验严谨性 |
| ICML | 机器学习顶会 | 10 页限制，强调理论贡献 |
| ACL | 计算语言学顶会 | 9 页限制，强调语言分析 |
| TPAMI | 人工智能顶刊 | 16 页，长文+综述 |
| 中文核心 | 国内核心期刊 | 中文学术规范，GB/T 7714 引用 |

每个 profile 包含：maxPages, requiredSections, styleGuide, bibliography。

---

## 相关文档

- 架构分析：[analysis-report.md](analysis-report.md)
- API 参考：[API.md](API.md)
- 路线图：[ROADMAP.md](ROADMAP.md)
- 愿景与架构决议：[VISION.md](VISION.md)
- 可复现性：[REPRODUCIBILITY.md](REPRODUCIBILITY.md)
- 安全审计：[SECURITY.md](SECURITY.md)

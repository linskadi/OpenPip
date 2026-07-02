# OpenPip 项目愿景与架构决议

> **副标题**: LLM 驱动的学术写作与代码审查工作流引擎
> **版本**: v0.1.0
> **最后更新**: 2026-07-01

---

## 一、项目定位

### 一句话定位

> **OpenPip 是一个开源学术写作工作流引擎。**
> 它编排多角色协作流程，内置质量门禁与多轮评审，自动生成符合学术规范的论文。

### 核心能力

- **管线**：9 个预定义管线模板 + 用户自定义，支持论文写作和代码审查（调研→规划→撰写→审稿→修改→格式化→导出），支持条件跳转、并行、迭代
- **质量**：8 层门禁（禁用词、谬误、叙事、数值、事实、反向大纲、反阿谀、引用校验）
- **评审**：Ensemble 5×5 评审（5 路并行 × 5 次反思）+ 7 种审稿风格
- **状态**：统一黑板（blackboard）管理跨角色切片状态，自动压缩历史
- **知识**：33+ 知识文件按需注入，支持 RAG 检索
- **导出**：Markdown → LaTeX → PDF，含图表自动扫描

### 与外部工具的关系

| 概念 | 本质 | OpenPip |
|------|------|---------------|
| **Agent 框架** (AutoGen/CrewAI) | LLM 自主决策 + 工具调用循环 | ❌ 不是。引擎控制，LLM 只生成 |
| **MCP Server** | 标准化工具协议 | ❌ 不是。未来可暴露 MCP Server |
| **opencode skill** | 插件化指令包 | ❌ 不是。独立应用，skill 只是遥控器 |
| **Workflow Engine** (Prefect/Airflow) | 编排多步骤流程 | ✅ **是。学术论文领域的编排引擎** |

OpenPip 不依赖 opencode、任何 Agent 框架或 MCP Server。它可以被 CLI / npm API / opencode skill 调用，但运行时完全独立。

---

## 二、现状评估（v0.1.0）

### 已实现的工程资产

| 类别 | 数量 | 说明 |
|------|------|------|
| 引擎模块 | 约 67 个 | 核心编排、评审、质量、LLM 调用、格式化等 |
| 测试用例 | 93+ | 36 项自检 + 3 e2e + 28 对抗 + 6 消融 + 其他 |
| 角色定义 | 10 个 | orchestrator / researcher / planner / writer / coder / reviewer / formatter / code-reviewer / contribution-architect / adversarial-researcher |
| 知识文件 | 33+ | 写作规范、格式、方法学、图表、竞赛 |
| 流水线 | 9 个 | lightweight / full-research（full-paper 别名）/ research-cs / code-review / competition-math-modeling / competition-data-science / competition-general / iterative-optimization |
| 期刊配置 | 5 个 | NeurIPS / ICML / ACL / TPAMI / 中文核心 |
| CLI 命令 | 13 个 | config / init / new / run / chat / evolve / annotate / agent / doctor / export / index / status / tui |
| TUI 界面 | ⬜ 计划中（Rust ratatui） | 当前仅 JS 启动器 stub |
| IPC 协议 | ⬜ 计划中（JSON-RPC 2.0） | NDJSON over stdin/stdout |

### 已实现的核心功能

- **黑板 v4**：FIELD_PERMISSIONS 白名单 + 历史压缩 + 自动迁移
- **Ensemble Review**：5 路 × 5 反思，中位数打分，反阿谀过滤
- **质量门禁**：8 维度注册表，含谬误检测 + 叙事一致性
- **迭代优化**：Writer↔Reviewer 攻防循环，收敛检测自动终止
- **用户审批门禁**：每阶段后展示-审批-修改循环，支持 CLI 模式
- **Post-stage Hooks**：事实校验 / 反向大纲 / 数据溯源，不阻塞主流程
- **自进化**：评审报告提取失败模式 → 自动改进 prompt 文件
- **LaTeX 导出**：图表自动扫描 + 未引用图片附录插入
- **模型分层**：L0 便宜模型 → L1 → L2（reviewer）
- **动态调度**：根据 research 输出自动插入/跳过阶段
- **结构化日志 + TF-IDF 缓存**

### 计划中（未实现）

- **Rust TUI**：双栏界面 + IPC 通信 + 审批交互（详见 ROADMAP.md）
- **Docker 一键复现**：Dockerfile + docker-compose.yml
- **统计显著性检验**：t检验/ANOVA/相关/效应量/功效分析
- **DI 容器**：Service Locator 模式

---

## 三、架构决议

### 决议 1: 不做真 Agent

角色是**角色化提示词模板**，不是有工具调用和自主决策的 AI Agent。**这不是缺陷，是设计选择。**

```
引擎做控制：定序、条件跳转、并行、重试、质量检查
LLM 做生成：只负责产出内容，不决定下一步做什么
用户做审批：每步结果展示给用户，确认后才继续
```

**不加入的功能：**
- ❌ 自主决策循环（LLM 决定下一步做什么）
- ❌ 工具调用循环（LLM 自主决定调用什么工具）
- ❌ Agent 间自主对话（两个 LLM 互相聊天）

**会选择性加入的功能：**
- ✅ 工具调用（引擎控制何时调、调什么）
  - Researcher → arXiv 检索
  - Coder → Python 代码执行
- ✅ 本地文件读取（引擎扫描目录，将文件摘要注入 prompt）

### 决议 2: 用户审批每步输出

从"用户确认阶段开始"升级为"用户审批阶段结果"：

```
Stage 执行 → 展示输出 → 用户选择:
  ├─ 确认 → 继续下一步
  ├─ 指出问题 → AI 修改 → 再展示 → 循环
  ├─ 手动编辑 → 保存后继续
  └─ 中止 → 结束
```

审批可发生在：每章写完后（逐章审批）、每个 stage 完成后（阶段审批）、整个 draft 完成后（整篇审批）。

### 决议 3: 工具调用由引擎控制

```
引擎决定"当前 stage 需要调工具" → 拼装 messages + tools
  → LLM 返回 tool_calls → 引擎执行 → 结果送回 LLM
  → LLM 生成最终输出
```

工具调用只在特定场景启用：
- `researcher` + `subtask: literature-review` → arxiv-search
- `coder` + `subtask: competition-code` → python-exec

### 决议 4: Rust TUI + JSON-RPC IPC

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

### 决议 5: 模块合并

72 个引擎模块逐步合并到 30-40 个。保留核心模块，合并薄封装：

| 合并方向 | 涉及文件 |
|---------|---------|
| 文献解析合并 | bibtex-parser / endnote-importer / zotero-importer → `literature/` |
| 质量模块集中 | data-provenance / reproducibility → `quality/` |
| 输出模块集中 | figure-generator / chart-generator / latex-exporter → `output/` |
| LLM 统一 | llm.js + model-router.js → `llm/caller.js` + `llm/router.js` |
| 状态统一 | shared-state.js + version-manager.js → `state/` |

### 决议 6: 术语更新

| 旧术语 | 新术语 | 原因 |
|--------|--------|------|
| Agent（指角色） | Role / 角色 | Agent 制造自主决策的错误预期 |
| Multi-Agent System | Workflow Engine | 准确描述核心能力 |
| dispatchAgent | dispatchRole | 对应术语更新 |
| .openpip/agents/ | .openpip/role-configs/ | 对应目录结构 |
| .openpip/prompts/ | .openpip/role-prompts/ | 对应目录结构 |

> 注：内部代码变量名 `agent` 保留（向后兼容），对外文档统一使用"角色"或"Role"。

---

## 四、风险与考量

### 向后兼容

- 文件重命名会破坏所有测试的 import 路径，需同步更新
- pipeline YAML 中 `agent` 字段名暂不修改，只改内部代码
- 对外 API 保留兼容别名

### Function Calling 依赖模型

- 不是所有模型都支持 function calling（如某些 ollama 本地模型）
- 必须保留回退路径：不支持 function calling 的模型走纯文本模式
- 通过 model-router 检测模型能力

### 代码执行安全

- Python 执行必须严格沙箱化
- 默认禁用，通过 config.json 中 `"enable_code_execution": true` 开启
- 竞赛项目 template 可默认开启，研究项目默认关闭
- 安全措施：超时控制、import 白名单、文件写入范围限制、内存限制

### 用户审批疲劳

- 长论文（7-8 章）每阶段都确认会让用户疲惫
- 提供 `--auto-pilot` 模式跳过审批（用于批量或 CI 场景）
- 每章写作的审批可合并为"这章写完了一起看"

### 子进程生命周期管理

- Rust TUI 端需要妥善处理 Node 子进程的启动/崩溃/重启
- `IpcClient::drop` 中必须 `kill()` + `wait()` 确保子进程退出
- Node 端意外退出时，Rust 端应检测并提示用户
- 提供重启机制（`r` 键重启引擎）

### 测试策略

- 每个 Phase 完成后跑 `npm test` 确保 95+ 测试仍通过
- 新模块必须有对应测试
- 新增外部依赖（arXiv API / Python 运行时）需要 mock 测试

---

## 五、关键术语表

| 术语 | 定义 |
|------|------|
| **Workflow Engine** | OpenPip 的核心定位。编排多步骤流程，控制执行顺序、条件、并行、重试。 |
| **Role** | 角色化提示词配置（原 Agent）。包含角色定义、模型参数、知识引用。没有工具调用或自主决策能力。 |
| **Stage** | Pipeline 中的一个执行步骤。指定用哪个 Role、做什么任务、输出到哪里。 |
| **Pipeline** | 一组有序的 Stage 定义，包含条件跳转、并行、迭代等控制逻辑。 |
| **Blackboard** | 跨 Role 共享的状态存储。每个 Role 只读取自己需要的字段切片。 |
| **Quality Gate** | 每阶段输出后的自动检查。不通过则自动重试。 |
| **Ensemble Review** | 5 路并行评审 × 5 次反思，取中位数评分 + 去重意见。 |
| **HIL** | Human-in-the-Loop。用户确认节点，可发生在阶段开始前或阶段结束后。 |
| **Function Calling** | LLM API 的工具调用能力。只在特定场景启用，且由引擎控制。 |
| **TUI** | Terminal User Interface。基于 ratatui 的全键盘驱动的终端界面。 |
| **IPC** | 进程间通信。使用 JSON-RPC over stdin/stdout 实现 Rust 前端和 Node 引擎的通信。 |
| **JSON-RPC** | 轻量级 RPC 协议。用作 Rust ↔ Node 的通信协议。 |

---

**相关文档**：
- 设计文档：[DESIGN.md](DESIGN.md)
- 架构分析：[analysis-report.md](analysis-report.md)
- API 参考：[API.md](API.md)
- 路线图：[ROADMAP.md](ROADMAP.md)
- 可复现性：[REPRODUCIBILITY.md](REPRODUCIBILITY.md)
- 安全审计：[SECURITY.md](SECURITY.md)

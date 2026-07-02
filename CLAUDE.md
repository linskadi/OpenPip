# OpenPip v0.1.0 学术写作工作流引擎

这是 OpenPip 项目根目录的上下文文件。
opencode 在此目录打开时自动加载此文件。

## 项目身份

OpenPip 是一个**开源学术写作工作流引擎**，不是多 Agent 系统。

- 核心是**编排**：定序执行 10 个角色，引擎控制流程，LLM 只负责生成内容
- 角色（Role）是**角色化提示词模板**，不是有工具调用和自主决策的真 Agent
- 独立于任何外部框架运行，不依赖 opencode

详见 `docs/VISION.md`。

## 项目结构

```
papers/                    # 论文项目目录（用户主目录）
.openpip/                 # 角色/知识/流水线/配置
├── role-prompts/       # 10 个写作角色定义（.md）
├── role-configs/       # 角色 YAML 配置（模型、知识引用）
├── knowledge/          # 知识库（33+ 文件）
│   ├── writing/        # 学术写作、禁用词、协作规范、零幻觉
│   ├── format/         # GB/T 7714、公式规范
│   ├── methodology/    # 实验设计、论证方法
│   ├── figure/         # 图表样式、选型指南、学术规范
│   ├── competition/    # 数学建模竞赛专属知识
│   └── reviewer-personas/  # 审稿人人格配置
├── venues/             # 期刊/会议配置（5 个 venue profile）
├── pipelines/          # 流水线定义（9 条）
├── prompt-config.yaml  # 可配置化 prompt 片段
├── classification-knowledge-map.yaml
└── config.json         # 全局配置
config/                   # 配置文件
├── model-tier-matrix.yaml
└── tool-platform-matrix.yaml
docs/
├── VISION.md           # 项目愿景与架构决议（核心参考）
├── rearch-plan.md      # 重构规划
├── DESIGN.md           # 完整设计文档
├── ROADMAP.md          # 路线图
├── REPRODUCIBILITY.md  # 可复现性指南
└── SECURITY.md         # 安全审计报告
src/
├── cli/                # CLI 入口 + Chat 命令
│   ├── openpip.js
│   ├── commands/       # 子命令（init, run, chat, annotate, evolve, config, status, doctor, agent, export, tui）
│   ├── services/       # Chat 服务层（intent-parser, tool-registry, project-service, session）
│   └── utils/          # CLI 工具函数
├── engine/             # 核心引擎
│   ├── constants.js      # 引擎常量（DEFAULT_MODEL 等）
│   ├── pipeline-loader.js # 管线模板加载器
│   ├── pipeline.js        # 流水线编排
│   ├── stage-executor.js  # 阶段执行
│   ├── llm/               # LLM 调用 + 模型路由
│   ├── quality/           # 质量门禁（8层 + 引用白名单 + 质量报告）
│   ├── review/            # 审稿系统（ensemble 5×5 + 反谄媚）
│   ├── state/             # 黑板 + 版本管理 + 收敛检测
│   ├── knowledge/         # RAG 知识检索
│   ├── literature/        # 文献解析（BibTeX + 引用格式化）
│   ├── output/            # LaTeX 导出 + 图表生成 + 数据溯源
│   ├── runtime/           # 平台检测 + prompt 组装
│   ├── infra/             # src/engine/infra/ — tracing + 日志 + 事件总线 + 调试 + 可视化进度
│   ├── features/          # 自进化 + 批注系统
│   ├── roles/             # 角色加载 + 调度 + 工具（arXiv/本地文件/Python执行）
│   ├── user-approval/     # 用户审批门禁
│   └── index.js
├── adapters/           # 多运行时适配器（agent/cli/base）
├── config/             # 配置文件
├── tests/              # 测试
├── scripts/            # 部署脚本
└── index.js            # 统一导出
```

## 角色团队

| 角色 | 角色定义 | 职责 |
|------|---------|------|
| orchestrator | .openpip/role-prompts/orchestrator.md | 总控调度（workflow 优先） |
| researcher | .openpip/role-prompts/researcher.md | 文献调研 |
| planner | .openpip/role-prompts/planner.md | 大纲设计（research/competition 双模式） |
| writer | .openpip/role-prompts/writer.md | 正文撰写/润色/摘要（subtask 切换） |
| coder | .openpip/role-prompts/coder.md | 竞赛建模代码（可选） |
| reviewer | .openpip/role-prompts/reviewer.md | 终审 + 完整性（ensemble 5×5 + reflection） |
| formatter | .openpip/role-prompts/formatter.md | 格式/绘图/导出（subtask 切换） |
| code-reviewer | .openpip/role-prompts/code-reviewer.md | 代码审查（4 维度：安全/质量/规范/建议） |
| contribution-architect | .openpip/role-prompts/contribution-architect.md | 贡献提炼与论证架构 |
| adversarial-researcher | .openpip/role-prompts/adversarial-researcher.md | 对抗性研究/反驳挖掘 |

## 工作流程

### 通用论文流程

1. 读取 `.openpip/role-prompts/orchestrator.md` 获取调度逻辑
2. 派遣 researcher → 输出 research-brief.md → 用户审批
3. 派遣 planner (mode: research) → 输出 outline-v1.md → 用户审批
4. 派遣 writer (subtask: draft) → 逐章输出 draft-v1.md（每章可用户审批）
5. 派遣 writer (subtask: summary) → 输出 summary.md
6. 派遣 reviewer (mode: research, ensemble 5×5) → 输出 review-report.md
7. 若 review 非 Accept → 派遣 writer (subtask: polish) → draft-v2.md
8. 派遣 formatter (subtask: format) → output/paper.md → 用户审批
9. 派遣 formatter (subtask: export) → 输出 LaTeX/PDF

### 数学建模竞赛流程

1. 派遣 researcher → 问题分析 → 用户审批
2. 派遣 planner (mode: competition) → 竞赛大纲（7 章结构）→ 用户审批
3. 派遣 coder → 编写并执行建模代码 → notebook.ipynb（已实现：Python 沙箱执行 + import 白名单）
4. 派遣 writer (subtask: competition-draft) → 输出 draft-v1.md
5. 派遣 reviewer (mode: competition, ensemble 5×5) → 输出 review-report.md
6. 若 review 非 Accept → 派遣 writer (subtask: polish) → draft-v2.md
7. 派遣 formatter (subtask: format → subtask: export) → 竞赛格式 LaTeX/PDF

### 审批门禁（已实现）

每阶段执行完成后，展示结果给用户并等待选择：
```
[回车] 确认进入下一步
[i]    指出问题 → AI 修改 → 再展示
[e]    手动编辑 → 保存后继续
[s]    中止
```

## 调度方式

派遣角色时，读取对应的角色文件作为指令：

```
读取 .openpip/role-prompts/researcher.md 作为你的角色定义。
按照指令执行。任务：[具体任务]。项目：papers/{project}/
```

## 单任务快捷指令

| 用户指令 | 派遣角色 |
|---------|---------|
| "查文献" / "文献综述" | researcher |
| "列大纲" | planner |
| "写绪论" / "写实验" / "写正文" | writer (subtask: draft) |
| "润色" / "去AI味" | writer (subtask: polish) |
| "生成摘要" | writer (subtask: summary) |
| "格式化" / "参考文献" | formatter (subtask: format) |
| "画图" / "图表" | formatter (subtask: figure) |
| "导出PDF" / "转LaTeX" | formatter (subtask: export) |
| "审稿" / "终审" / "查重" / "检查" | reviewer |
| "数学建模竞赛" / "建模比赛" | competition pipeline（含 coder） |

## 核心功能

- **黑板共享状态**：角色间通过 `state/blackboard.json` 传切片字段，不传全历史对话（省 token）
- **默认模型常量**: DEFAULT_MODEL (src/engine/constants.js) — 全局唯一默认 LLM 模型常量，避免硬编码重复
- **reviewer ensemble**：5 路并行评审 × 5 次反思，取分数中位数 + 意见去重合并
- **HIL 关键点**：每阶段后用户审批（gate.js 实现），支持 确认/反馈/编辑/中止
- **反馈回环**：review→revise 用 condition，Accept 时自动跳过润色
- **模型分层**：orchestrator/formatter 用 L0 便宜模型，reviewer 用 L2，writer/planner 用 L1
- **质量门禁**：每阶段输出后自动检查（禁用词/术语/公式/字数）
- **动态调度**：根据输出质量自动重跑或跳过阶段
- **知识 RAG**：按需检索相关知识，token 节省 ~80%
- **评审闭环**：审稿意见自动拆解→修改→复核
- **迭代评审**：Writer↔Reviewer 多轮攻防，收敛检测自动终止
- **反阿谀机制**：Anti-Sycophancy 三层防御，防止 AI 互相放水
- **学术真实性**：零幻觉原则，三重事实校验，事实溯源报告
- **学术绘图**：代码式生成（禁止 AI 直接生图），期刊风格模板化
- **批注协作**：解析 `<!-- TODO: ... -->` 自动分发修改
- **竞赛模式**：数学建模竞赛专属流水线、模板、评分标准
- **LaTeX 导出**：Markdown→LaTeX+PDF，支持学术/竞赛模板；自动扫描 figures/ 目录插入未引用图片
- **自进化系统**：评审报告自动分析失败模式→回归检测→改进 prompt；历史感知严重度提升
- **7 种审稿风格**：strict/lenient/method/writing + 贡献检验者/魔鬼代言人/领域专家
- **论证质量检查**：8 项谬误检测（证据匹配/过度声称/循环论证等）
- **叙事连贯性检查**：5 项断裂检测（承诺交付/冗余/过渡/设计追溯/术语引入）
- **期刊自适应**：5 个 venue profile（NeurIPS/ICML/ACL/TPAMI/中文核心）
- **CrossRef 引用验证**：API 校验文献真实性（未实现）
- **文本泄漏检测**：13 种泄漏模式检测
- **数值一致性校验**：草稿 vs 实验数值对比
- **arXiv 文献检索**：真实论文检索能力（已实现：通过 function calling + arxiv-search 工具）

## 知识库

写作时读取 `.openpip/knowledge/` 下的知识文件（33+ 文件）：
- **terminology.md** — 机械工程术语表（中英文对照，150+项）
- **fallacies.md** — 学术论证谬误目录（9 种谬误+修正建议）
- **statistical-tests.md** — 统计检验方法参考
- **writing/academic-style.md** — 学术写作规范与建设性指导
- **writing/forbidden-words.md** — 禁用词库（AI 高频词、口语化、模糊词）
- **writing/agent-collaboration-rules.md** — 角色全局协作契约
- **writing/zero-hallucination-rules.md** — 零幻觉原则
- **writing/argument-structure.md** — 论证结构规范
- **writing/english-academic.md** — 英文学术写作规范
- **writing/common-pitfalls.md** — 常见写作陷阱
- **writing/survey-methodology.md** — 综述方法
- **writing/technical-report.md** — 技术报告规范
- **writing/business-plan.md** — 商业计划书规范
- **writing/competition-writing-rules.md** — 竞赛写作规范
- **format/gb7714.md** — GB/T 7714-2015 参考文献格式
- **format/formula.md** — LaTeX 公式规范与常用符号
- **methodology/methodology-experiment.md** — 实验设计方法
- **methodology/methodology-argumentation.md** — 论证逻辑方法
- **methodology/experiment-design.md** — 实验设计补充
- **figure/style-templates.yaml** — IEEE/Nature/国内学报/学位论文图表规范
- **figure/chart-selection-guide.md** — 按表达目的匹配最优图表类型
- **figure/academic-figure-rules.md** — 学术图表禁止项
- **figure/competition-visualization-standards.md** — 竞赛可视化标准
- **competition/math-modeling-structure.md** — 数学建模竞赛论文结构
- **competition/sensitivity-analysis.md** — 灵敏度分析方法
- **competition/assumption-writing.md** — 假设撰写规范
- **competition/model-evaluation.md** — 模型评估方法
- **competition/mcm-icm-rules.md** — MCM/ICM 规则
- **competition/coding-anti-patterns.md** — 编码反模式
- **competition/math-modeling-methods.md** — 建模方法
- **competition/algorithm-selection.md** — 算法选择
- **competition/modeling-templates.md** — 建模模板
- **reviewer-personas/neurips-strict.md** — NeurIPS 严格审稿人
- **reviewer-personas/acl-linguist.md** — ACL 语言学家审稿人
- **reviewer-personas/chinese-core-method.md** — 中文核心方法审稿人

## 一致性记忆

每次派遣前检查 `papers/{project}/drafts/consistency-memory.md`：
- 不存在 → 创建（术语表、变量表、引用表、图表表）
- 存在 → 读取并注入给角色
- 每章完成后 → 更新（新增术语、变量、引用、图表）

## 黑板（Blackboard v4）

每次派遣前检查 `papers/{project}/state/blackboard.json`：
- 不存在 → `initBlackboard` 初始化（topic/mode/research/outline/draft/memory/review/integrity）
- 存在 → 仅注入当前角色/subtask 所需字段切片（`sliceFor`），不传全历史对话（省 token ~61%）
- 每阶段完成后 → `writeField` 写回对应字段（受 `FIELD_PERMISSIONS` 白名单约束）
- 历史记录 → `appendHistory` 累加；超过 10 条触发 `compressHistory`，更早条目折叠为 1 条摘要，总条数上限 50
- 版本不匹配 → `migrateBlackboard` 自动从 v1→v2→v3→v4 迁移

## 输出目录

```
papers/{project}/
├── research/        # 研究简报
├── user-input/      # 用户提供的数据/预调研/参考范文
├── data/            # 竞赛数据文件
├── drafts/          # 草稿（每章独立 + 合并版 + 润色版）
├── figures/         # 图表（.py/.tex 源码 + .pdf 矢量图 + .png 预览）
├── output/          # 最终输出（格式化版 + 审稿报告 + LaTeX）
├── versions/        # 版本快照
└── metadata.json    # 项目状态
```

## 学术规范

- 第三人称，被动语态
- 禁止口语化、网络用语
- 公式编号连续 (1), (2), (3)...
- 引用格式 GB/T 7714-2015
- 每段 2-4 篇引用
- 变量首次出现必须定义
- **零幻觉**：绝对禁止编造文献/数据/作者/基金，关键论断必须有来源
- **事实声明**：每章末尾输出事实来源（用户/知识库/引用/原创）

## 竞赛专属规范

- **论文结构**：问题重述→假设→模型→方法→结果→灵敏度→结论
- **页数限制**：25 页（MCM/ICM），含附录
- **摘要页**：独立一页，包含问题、模型、方法、结果摘要
- **灵敏度分析**：必须包含，参数变化±10-20%
- **模型评价**：优缺点分析，改进方向
- **图表比例**：目标 68% 图表覆盖

## 重构方向（v0.1.0，当前版本）

详见 `docs/VISION.md` 和 `docs/rearch-plan.md`。

当前确认的架构决议：

1. **不做真 Agent** — 引擎控制流程，LLM 只生成内容，用户审批每步
2. **用户审批门禁** — 每阶段后展示-审批-修改循环（P0）
3. **选择性工具调用** — 引擎控制何时调工具（researcher 搜 arXiv / coder 执行 Python）
4. **本地文件识别** — 扫描 user-input/ data/ references/ 目录（P1）
5. **独立运行** — 不依赖任何外部框架（opencode/Agent 框架/MCP）
6. **模块合并** — 72 → ~68 模块（子目录化重组）
7. **术语修正** — "Agent" → "Role" / "角色"

## 模块集成状态

### 已集成到核心引擎
- **流水线编排**：pipeline.js、pipeline-loader.js、stage-executor.js
- **角色调度**: roles/loader.js、roles/dispatcher.js
- **LLM 调用**：llm/llm.js、llm/model-router.js
- **质量门禁**：quality/quality-check.js、quality/fact-verifier.js、quality/reverse-outline.js、quality/argumentation-checker.js、quality/narrative-checker.js、quality/consistency-checker.js
- **审稿系统**：review/ensemble-review.js、review/anti-sycophancy.js、review/iterative-review.js、review/review-loop.js
- **状态管理**：state/shared-state.js、state/version-manager.js、state/convergence-detector.js
- **知识检索**：knowledge/knowledge-rag.js、knowledge/knowledge.js
- **文献处理**：literature/bibtex-parser.js、literature/reference-formatter.js
- **输出导出**：output/latex-exporter.js、output/figure-generator.js、output/data-provenance.js
- **运行时适配**：runtime/platform-detector.js、runtime/prompt-assembler.js
- **基础设施**: src/engine/infra/logger.js、src/engine/infra/tracing.js、src/engine/infra/event-bus.js、src/engine/infra/debug-observability.js、src/engine/infra/visual-progress.js
- **特色功能**：features/self-evolution.js（自进化）、features/annotation.js（批注系统）
- **用户审批**：user-approval/gate.js、user-approval/feedback.js
- **反馈解析**：feedback-parser.js

### 已删除/不再计划的模块
- hot-reload.js — 热重载管理器
- multilingual.js — 多语言对齐
- chart-generator.js — 图表生成器（已由 figure-generator.js 替代）
- plugin-manager.js — 插件管理器
- template-marketplace.js — 模板市场
- knowledge-branching.js — 知识分支管理
- layered-scheduler.js — 分层调度器
- literature-library.js — 文献库管理

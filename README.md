# OpenPip

> **LLM 驱动的学术写作与代码审查工作流引擎**
>
> 管线式架构 + 用户介入 + 质量门禁，稳定产出合格学术论文和代码审查报告。
>
> 界面：CLI + 自然语言 Chat
>
> v0.1.0 — MIT License

---

## 快速开始

`ash
npm install -g openpip
openpip config              # 配置 API Key
openpip chat                # 自然语言对话（推荐）
`

### 典型对话

`
你：帮我写一篇关于 Transformer 优化的科研论文
AI：已创建项目 research/cs/transformer-optimization，使用轻量级管线。
    准备开始写作，确认执行？
你：开始
AI：⏳ 执行中... research → skeleton → draft → review → export ✅
`

`
你：帮我做一次数学建模竞赛
AI：已创建项目 competition/math-modeling/competition-name，使用竞赛管线（含代码执行）。
你：审查一下这段代码
AI：🔍 执行代码审查... 扫描→安全→质量→建议→报告 ✅
`

## 管线模板系统

9 个预定义管线，按场景自动匹配：

| 管线 | 场景 | 阶段数 | 特点 |
|------|------|--------|------|
| lightweight | 通用科研 | 5 | 调研→大纲→初稿→审稿→导出 |
| full-research | 完整科研 | 12 | 含摘要、迭代优化、图表 |
| research-cs | 计算机论文 | 6 | 含图表生成 |
| competition-math-modeling | 数学建模竞赛 | 10 | 含代码执行+图表+自进化 |
| competition-data-science | 数据竞赛 | 7 | 含代码执行+图表 |
| competition-general | 通用竞赛 | 5 | 轻量竞赛版 |
| **code-review** | **代码审查** | **5** | **扫描→安全→质量→建议→报告** |
| full-paper | 完整版（兼容） | 12 | 原始全量管线（同 full-research，兼容旧命名） |
| iterative-optimization | 迭代优化 | 8 | 多轮迭代优化，适合高质量论文打磨 |

用户可在 papers/ 目录下自定义管线模板。

## 核心能力

### 管线引擎
- YAML 定义管线，JS 引擎确定性执行
- 依赖感知并行执行（DAG 调度）
- 断点续跑、条件跳转、阶段级重试
- LLM 优化管线（可开关）

### 质量保障
- 8 层门禁：禁用词→术语→论证谬误→叙事断裂→数值一致性→事实校验→反向大纲→反阿谀
- 引用白名单：BibTeX 导入 + 引用验证，防止编造文献
- 质量报告：自动生成，包含各项指标和改进建议

### 审稿系统
- Ensemble 5×5：5 路并行评审 × 5 次反思
- 7 种审稿风格：strict/lenient/method/writing + 贡献检验者/魔鬼代言人/领域专家
- 反谄媚：三层防御，防止 AI 互相放水
- 自进化：分析失败模式，自动改进 prompt

### 用户介入
- 关键阶段用户审批（approve/feedback/edit/stop）
- 聊天模式自动确认，可改为交互式
- LLM 管线优化开关（用户可控）

### Chat 命令
- 10 个工具：init_project, ingest_materials, run_pipeline, query_status, export_paper, import_references, list_references, list_pipelines, review_code, toggle_feature
- 自然语言意图解析（LLM function calling）
- 会话状态持久化
- 非交互模式：openpip chat "帮我写论文"

## 项目结构

`
.openpip/                     # 配置与知识库
├── role-prompts/             # 10 个角色定义（含 code-reviewer）
├── role-configs/             # 角色 YAML 配置
├── knowledge/                # 知识库（33+ 文件）
├── pipelines/                # 9 个管线模板
├── venues/                   # 期刊/会议配置
└── config.json               # 全局配置

src/
├── cli/                      # CLI + Chat 命令
│   ├── openpip.js            # 入口
│   ├── commands/             # 子命令
│   ├── services/             # Chat 服务层
│   │   ├── intent-parser.js  # LLM 意图解析
│   │   ├── tool-registry.js  # 10 个工具定义
│   │   ├── project-service.js# 项目操作
│   │   └── session.js        # 会话管理
│   └── utils/                # CLI 工具（config/readline）
├── engine/                   # 核心引擎（12 个子目录）
│   ├── pipeline-loader.js    # 管线模板加载器
│   ├── pipeline-advisor.js   # LLM 管线优化
│   ├── pipeline.js           # 流水线编排
│   ├── stage-executor.js     # 阶段执行
│   ├── llm/                  # LLM 调用 + 模型路由
│   ├── quality/              # 质量门禁 + 引用白名单 + 报告
│   ├── review/               # 审稿系统
│   ├── state/                # 黑板 v4
│   ├── knowledge/            # RAG 知识检索
│   ├── output/               # LaTeX 导出
│   └── features/             # 自进化 + 批注系统
├── tests/                    # 测试（36 自检 + 20 vitest）
└── scripts/                  # 部署脚本

papers/                       # 论文项目目录
├── research/                 # 科研论文
│   ├── general/              # 通用
│   ├── cs/                   # 计算机
│   ├── math/                 # 数学
│   └── engineering/          # 工程
└── competition/              # 竞赛论文
    ├── math-modeling/        # 数学建模
    ├── data-science/         # 数据竞赛
    └── general/              # 通用竞赛
`

## 测试

`
npm test                      # 36 项自检
npm run test:vitest           # 20 项 vitest
node src/tests/test-e2e-pipeline.js   # e2e 集成
`

## 文档

- docs/DESIGN.md — 完整设计文档
- docs/VISION.md — 项目愿景与架构决议
- docs/rearch-plan.md — 重构规划
- docs/ROADMAP.md — 路线图

## 依赖

| 包 | 用途 |
|----|------|
| js-yaml | 解析 YAML 配置 |
| vitest | 测试框架 |

**不依赖任何 Agent 框架、opencode、或 MCP Server。**
# OpenPip 路线图

> **当前版本**: v0.1.0
> **最后更新**: 2026-07-01

---

## 一、版本里程碑

| 版本 | 状态 | 里程碑含义 |
|------|------|-----------|
| v0.1.0 | ✅ | 原型可用，73 项测试通过 |
| v0.1.0 | ✅ | Chat 命令 + 引擎模块重组 + Vitest + 质量保障增强 |
| v0.1.0 | ✅ | 项目改名 OpenPip + 代码审查管线 + LLM 管线优化 + 管线模板系统 |
| v0.1.0 | ✅ 基本完成 | stage-executor 拆分 + 更多竞赛模板 |
| v0.1.0 | ⬜ | MCP 服务化 + 通用管线平台 |
| v1.0.0 | ⬜ | 稳定版：完整质量保障  文档完善 |

---

## 二、已完成

### 工程地基（S1-S4）
- ✅ 36 项自检 + 3 E2E + 28 对抗 + 6 消融 + 20 项 vitest 全部通过
- ✅ Pipeline 编排与执行分离
- ⬜ DI 容器（Service Locator 模式）— P4 · 长期规划（非必需），已搁置，不阻塞
- ✅ 结构化日志（console + traceId）— pino 已移除（v0.1.0+）
- ✅ GitHub Actions CI/CD

### Prompt 与知识优化（Q0）
- ✅ 10 角色定义 + 7 种审稿风格
- ✅ 知识库 33+ 文件（writing/format/methodology/figure/competition）
- ✅ TF-IDF  Embedding 混合 RAG 检索
- ✅ TF-IDF 预计算索引  热重载

### 开源经验汲取（Q0.5）
- ✅ arXiv 检索（CrossRef 验证 ⬜ 未实现）
- ✅ 泄漏检测  数值一致性校验
- ✅ 事实校验器  反向大纲校验器
- ✅ 角色化 YAML 配置

### 质量架构（Q1-Q4）
- ✅ 8 层质量防线：禁用词→公式/术语→论证谬误→叙事断裂→数值一致性→事实校验→反向大纲→反阿谀
- ✅ Ensemble 5×5 评审  反阿谀过滤
- ✅ 期刊自适应（5 个 Venue Profile）
- ✅ 审稿反馈学习  作者回复生成

### 可复现性与安全（S7-S8）
- ⬜ Docker 一键复现（Dockerfile  docker-compose.yml）— 计划中，文件未提供
- ✅ 消融实验框架（6 维）
- ⬜ 统计显著性检验（t检验/ANOVA/相关/效应量/功效分析）— 计划中，模块未实现
- ✅ 安全审计（OWASP Top 10）
- ✅ API 文档（160 API，17 分类）
- ✅ npm 包发布准备

---

## 三、已完成（v0.1.0）

### P0: 用户审批门禁
- ✅ 新增 user-approval/gate.js — 展示  收集用户选择
- ✅ 新增 user-approval/feedback.js — 解析意见 → 修改指令
- ✅ 改造 executeSingleStage — 执行后插入审批门禁
- ✅ Pipeline YAML 添加 approval 配置段
- ✅ 逐章审批模式

### P0: IPC 通信层（计划中，未实现）
- ⬜ 定义 JSON-RPC 协议（method / params / event schema）
- ⬜ 实现 ipc/server.js — Node.js 端 stdin 监听  stdout 推送
- ⬜ 实现 ipc/bridge.js — 桥接引擎 pipeline 事件到 IPC 消息
- ⬜ 实现 Rust ipc.rs — stdin/stdout 读写  JSON 序列化
- ⬜ 审批门禁支持 IPC 模式
- ⬜ project.init 实现（复用 engine.initProject）

### P0: Rust TUI 界面（计划中，未实现）— 已搁置（当前主推 JS TUI stub  CLI 交互模式）
- ⬜ Cargo 项目初始化  ratatui 骨架
- ⬜ AppState 状态管理  事件循环（键盘  IPC 双通道）
- ⬜ 标题栏  进度条  状态栏组件
- ⬜ 左侧项目列表  内容面板（Markdown 渲染  滚动）
- ⬜ 右侧对话面板（消息列表  审批按钮  输入框  滚动）
- ✅ openpip tui CLI 命令（JS 启动器 src/cli/commands/tui-cmd.js）
- ⬜ 端到端联调

### P1: 引擎模块重组
- ✅ 63 个根级文件 → 16 个，其余分入 13 个子目录
- ✅ 删除 4 个 placeholder 模块  2 个 deprecated 模块
- ✅ 删除未使用的 openai 依赖
- ✅ 更新所有 require() 路径
- ✅ 73 项测试全部通过

### P2: Chat 自然语言交互
- ✅ openpip chat 命令（REPL  非交互模式）
- ✅ 10 个工具（init/ingest/run/status/export/import-refs/list-refs/pipelines/review-code/toggle-feature）
- ✅ LLM function calling 意图解析
- ✅ 会话状态持久化
- ✅ 加载动画  错误处理
- ✅ 20 项 vitest 测试用例

### P3: 质量保障增强
- ✅ 引用白名单（BibTeX 导入  验证）
- ✅ 质量报告自动生成
- ✅ LaTeX 中文支持（ctex 自动注入）
- ✅ Vitest 测试框架引入

---

### P4: 管线模板系统
- ✅ pipeline-loader.js：按类别/领域自动匹配管线
- ✅ 9 个管线模板（轻量级/完整版/竞赛/代码审查/迭代优化）
- ✅ papers/ 目录重组为 research/  competition/

### P5: 代码审查管线
- ✅ code-review.yaml（5阶段：扫描→安全→质量→建议→报告）
- ✅ code-reviewer 角色 prompt
- ✅ review_code 工具（Chat 支持代码审查）

### P6: LLM 管线优化
- ✅ pipeline-advisor.js（3 个功能）
- ✅ LLM 生成管线（根据主题自动决定阶段）
- ✅ LLM 阶段流转（评估产出质量决定下一步）
- ✅ LLM 历史分析（分析执行数据优化模板）
- ✅ 用户可控开关（toggle_feature 工具）

### P7: 项目改名
- ✅ OpenManuscript → OpenPip（91 文件，334 处替换）
- ✅ .openmanuscript/ → .openpip/
- ✅ openmanuscript.js → openpip.js

---

## 四、待办（按优先级）

### P1: 本地文件识别
- [x] 新增 roles/tools/local-files.js — 扫描 user-input/、data/、references/
- [x] 文件类型识别  摘要生成（CSV 解析列名、PDF 提取文本）
- [x] 注入到 dispatch prompt 中
- [x] 支持文件类型：.md/.txt/.csv/.xlsx/.json/.pdf/.py

### P1: 引擎模块合并
- [x] 76 个模块重组为 13 个子目录（llm/quality/state/review/output/knowledge/runtime/infra/features  已有 roles/classifier/user-approval/hooks/literature）
- [x] 文献解析合并：bibtex → literature/（endnote/zotero 计划中未实现）
- [x] 质量模块集中：quality-check/argumentation/narrative/consistency/claim/promise/fact-verifier/terminology → quality/
- [x] 输出模块集中：latex-exporter/figure-generator/figure-linker/data-provenance → output/
- [x] LLM 统一：llm.js  model-router.js → llm/
- [x] 状态统一：shared-state  version-manager  convergence-detector → state/

### P2: Coder 代码执行循环
- [x] 新增 roles/tools/python-exec.js — Python 沙箱执行（import 白名单 SAFE_IMPORTS）
- [x] 改造 dispatcher.js — 代码生成 → 执行 → 修复循环（codeExecutionLoop）
- [x] import 白名单、超时控制、安全限制
- ✅ notebook.ipynb 自动生成（generateNotebook）
- [x] 竞赛模式端到端验证（华数杯2023C题  智能车路径规划 已验证通过）

### P3: Researcher 联网检索
- [x] llm.js 支持 function calling（callLLMWithTools，5 轮工具循环）
- [x] 新增 roles/tools/arxiv-search.js — arXiv API 检索
- [x] 工具注册机制（内置 arxiv_search  read_project_files）
- [x] 向后兼容：不支持 function calling 的模型走纯文本回退

### P3: 性能优化
- [x] BlackboardCache 集成到主流程（pipeline.js）
- [x] 无依赖阶段间并行执行（pipeline.js parallel groups）
- [x] 测试框架引入 Vitest（vitest.config.js  20 个测试用例，npm run test:vitest）
- [x] Lint 覆盖扩展到全目录（eslint --fix 清理完成，0 errors）

---

## 五、执行建议

**已完成阶段：** P1 本地文件识别 ✅ → P1 模块合并 ✅ → P2 Coder 代码执行 ✅ → P3 Researcher 联网检索 ✅

**剩余工作：**
1. stage-executor.js 拆分（已从 1049→416 行）
2. 更多竞赛模板（国赛 CUMCM）
3. MCP 服务化
4. 通用管线平台化（从学术写作扩展到更多场景）

**每个阶段完成后验证：**
```bash
node src/tests/test-complete.js    # 36 项自检
npx eslint src/                    # Lint 零 error
```

---

**相关文档**：
- 设计文档：[DESIGN.md](DESIGN.md)
- 愿景与架构决议：[VISION.md](VISION.md)
- 架构分析：[analysis-report.md](analysis-report.md)
- API 参考：[API.md](API.md)
- 可复现性：[REPRODUCIBILITY.md](REPRODUCIBILITY.md)
- 安全审计：[SECURITY.md](SECURITY.md)
> ⚠️ **历史归档文档**（重构计划）
> 本重构计划大部分已完成。当前待办请参考 docs/ROADMAP.md。

# 重构计划 (v0.1.0 → v0.1.0)

## 已完成

### 项目改名（v0.1.0）
- ✅ OpenManuscript → OpenPip（91 文件，334 处替换）
- ✅ .openmanuscript/ → .openpip/
- ✅ openmanuscript.js → openpip.js
- ✅ openmanuscript.config.json → openpip.config.json
- ✅ Git remote 更新

### 管线模板系统（v0.1.0）
- ✅ pipeline-loader.js：按类别/领域自动匹配管线
- ✅ 5 个管线模板（轻量级/完整版/竞赛/代码审查）
- ✅ papers/ 目录重组为 research/ + competition/
- ✅ 项目创建自动匹配领域管线

### 代码审查管线（v0.1.0）
- ✅ code-review.yaml（5阶段：扫描→安全→质量→建议→报告）
- ✅ code-reviewer 角色 prompt（4维度审查）
- ✅ review_code 工具（Chat 支持代码审查）

### LLM 管线优化（v0.1.0）
- ✅ pipeline-advisor.js（3 个功能）
- ✅ LLM 生成管线（根据主题自动决定阶段）
- ✅ LLM 阶段流转（评估产出质量决定下一步）
- ✅ LLM 历史分析（分析执行数据优化模板）
- ✅ 用户可控开关（toggle_feature 工具）

### Chat 命令增强（v0.1.0）
- ✅ 10 个工具（含 review_code, list_pipelines, toggle_feature）
- ✅ 意图解析支持代码审查和管线选择

### Phase 1: 减法 — 删除死代码
- ✅ 删除 `_deprecated/` 目录（plugin-manager.js, template-marketplace.js）
- ✅ 删除 4 个 placeholder 模块（multilingual.js, chart-generator.js, knowledge-branching.js, layered-scheduler.js）
- ✅ 从 index.js 移除已删模块的 lazy 注册和导出
- ✅ 从 package.json 删除未使用的 `openai` 依赖

### Phase 2: 子目录重组
- ✅ 创建 9 个子目录：llm, quality, state, review, output, knowledge, runtime, infra, features
- ✅ 移动 45 个文件到对应子目录
- ✅ 更新所有 require() 路径（engine 根级文件、子目录间交叉引用、roles/classifier 等外部引用）
- ✅ 每个子目录创建 index.js barrel 文件（部分）

### Phase 3: 测试验证
- ✅ 更新 tests/test-complete.js 的 require 路径
- ✅ 移除已删模块的测试用例
- ✅ 42/42 测试全部通过
- ✅ 152 个导出正常

## 重构前后对比

| 指标 | 重构前 | 重构后 |
|------|--------|--------|
| engine 根级 JS 文件 | 63 | 19 |
| 子目录数 | 4 (roles, classifier, user-approval, literature) | 13 |
| 总 JS 文件数 | 80 | ~73 |
| 测试通过率 | 39/42 | 42/42 |
| 导出数 | 152 | 152 |

## 新目录结构

```
src/engine/
├── index.js              # 模块注册表（19 个根级文件）
├── pipeline.js           # 流水线编排
├── stage-executor.js     # 阶段执行（待进一步拆分）
├── roles/
│   ├── dispatcher.js     # 角色调度器
│   ├── loader.js         # 角色加载器
├── utils.js, constants.js, schema.js, validate.js
├── resource-resolver.js
├── feedback-parser.js
│
├── llm/                  # LLM 调用层
│   ├── llm.js            # callLLM, budget tracking, function calling
│   └── model-router.js   # 三级模型路由
│
├── quality/              # 质量保障（11 个模块）
│   ├── quality-check.js  # 指标注册表 + 8 内置指标
│   ├── argumentation-checker.js, narrative-checker.js, ...
│   └── fact-verifier.js, terminology.js
│
├── review/               # 审稿系统
│   ├── ensemble-review.js    # 7 风格 ensemble 5×5
│   ├── iterative-review.js   # 迭代审稿 + 收敛检测
│   ├── anti-sycophancy.js
│   └── review-loop.js, review-parser.js
│
├── state/                # 状态管理
│   ├── shared-state.js   # Blackboard v4
│   ├── version-manager.js
│   └── convergence-detector.js
│
├── knowledge/            # 知识系统
│   ├── knowledge.js, knowledge-rag.js
│   └── knowledge-growth.js
│
├── output/               # 输出生成
│   ├── latex-exporter.js, figure-generator.js
│   ├── figure-linker.js, data-provenance.js
│
├── runtime/              # 运行时
│   └── platform-detector.js, prompt-assembler.js
│
├── infra/                # 基础设施
│   ├── tracing.js, logger.js, event-bus.js
│   └── debug-observability.js, visual-progress.js
│
├── features/             # 功能特性
│   └── self-evolution.js, annotation.js
│
├── roles/                # 角色系统（已有）
├── user-approval/        # 审批门禁（已有）
└── literature/           # 文献工具（已有）
```

## 下一步

### 短期（1-2 周）
- [ ] 拆分 `stage-executor.js`（416 行，已拆分）为 4 个模块
- [ ] 为每个子目录的 index.js 补全 barrel exports
- [ ] 恢复 CLAUDE.md 中的目录结构描述为实际状态

### 中期（1-2 月）
- [ ] 接入 Jupyter code execution sandbox
- [ ] 完善 arXiv 检索集成到 researcher 流水线
- [x] 引入 Vitest 测试框架
- [ ] 用真实竞赛题目做端到端质量迭代

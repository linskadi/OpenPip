# OpenPip 可复现性指南

> **版本**: v0.1.0
> **最后更新**: 2026-06-30

---

## 一、消融实验

支持 6 维消融实验框架：

| 维度 | 说明 |
|------|------|
| 提示词变体 | 不同提示词模板对论文质量的影响 |
| 模型选择 | 不同 LLM 模型的性能对比 |
| 知识库规模 | 知识库大小对生成质量的影响 |
| 流水线配置 | 不同流水线阶段组合的效果 |
| 评审策略 | 不同评审模式（严格/宽松）的结果差异 |
| 迭代轮次 | 多轮迭代对论文质量的提升效果 |

### 运行消融实验

> 注：`ablation-study.js` 已移除，以下为历史示例。当前消融测试见 `src/tests/test-ablation.js`。

```javascript
// 历史接口（已移除）：
// const { runAblation } = require('./src/engine/ablation-study');
// const report = await runAblation(projectRoot, {
//   dimensions: ['prompt', 'model', 'knowledge'],
//   samples: 10
// });
```

---

## 二、统计显著性检验

> **注意**：统计显著性检验模块（`statistical-advisor`）未实现，规划中。原计划支持 p 值、效应量（Effect Size）、置信区间，以及 t 检验、ANOVA、相关性分析、效应量计算、功效分析等方法，当前均未实现。

---

## 三、最佳实践

1. **保留版本快照**：`VersionManager.autoSnapshot` 每阶段自动保存黑板状态，便于回溯
2. **记录所有参数**：在论文中明确列出生成参数和配置
3. **保留中间结果**：保存黑板状态和草稿版本，便于追溯
4. **使用相同随机种子**：确保随机化结果可复现

---

## 四、相关文件

### 当前实现
- `src/engine/output/data-provenance.js` — 数据溯源模块
- `src/engine/state/version-manager.js` — 版本管理
- `src/engine/infra/tracing.js` — 执行追踪
- `src/tests/test-ablation.js` — 消融实验测试

### 历史参考（已删除）
- ~~`src/engine/reproducibility.js`~~ — 可复现性管理核心模块（已删除，规划中）
- ~~`src/engine/api.js`~~ — 编程接口（已删除）
- ~~`src/engine/statistical-advisor.js`~~ — 统计显著性检验（已删除，规划中）
- ~~`src/engine/ablation-study.js`~~ — 消融实验框架（已删除，由 test-ablation.js 替代）
- ~~`Dockerfile`~~ — Docker 镜像定义（已删除，规划中）
- ~~`docker-compose.yml`~~ — 多服务编排配置（已删除，规划中）

---

**相关文档**：
- 设计文档：[DESIGN.md](DESIGN.md)
- 愿景与架构决议：[VISION.md](VISION.md)
- 路线图：[ROADMAP.md](ROADMAP.md)
- 架构分析：[analysis-report.md](analysis-report.md)
- API 参考：[API.md](API.md)
- 安全审计：[SECURITY.md](SECURITY.md)

---

> **说明**：Docker 复现、ReproducibilityManager、snapshot/verify 接口均为规划中功能，尚未实现。当前可复现性由 `data-provenance.js`（数据溯源）、`version-manager.js`（版本快照）、`tracing.js`（执行追踪）以及 `test-ablation.js`（消融实验测试）提供。

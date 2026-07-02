# 消融测试报告: openpip-core-ablation

**组件数**: 6

## 基准性能
- shared-state: "ok"
- container: "skipped (module not implemented)"
- logger: "logged"
- stage-executor: 12
- quality-check: false
- model-router: "deepseek/deepseek-chat"

## 消融结果
### 移除: shared-state
- ~~shared-state~~ (已移除)
- container: "skipped (module not implemented)"
- logger: "logged"
- stage-executor: 12
- quality-check: false
- model-router: "deepseek/deepseek-chat"

### 移除: container
- shared-state: "ok"
- ~~container~~ (已移除)
- logger: "logged"
- stage-executor: 12
- quality-check: false
- model-router: "deepseek/deepseek-chat"

### 移除: logger
- shared-state: "ok"
- container: "skipped (module not implemented)"
- ~~logger~~ (已移除)
- stage-executor: 12
- quality-check: false
- model-router: "deepseek/deepseek-chat"

### 移除: stage-executor
- shared-state: "ok"
- container: "skipped (module not implemented)"
- logger: "logged"
- ~~stage-executor~~ (已移除)
- quality-check: false
- model-router: "deepseek/deepseek-chat"

### 移除: quality-check
- shared-state: "ok"
- container: "skipped (module not implemented)"
- logger: "logged"
- stage-executor: 12
- ~~quality-check~~ (已移除)
- model-router: "deepseek/deepseek-chat"

### 移除: model-router
- shared-state: "ok"
- container: "skipped (module not implemented)"
- logger: "logged"
- stage-executor: 12
- quality-check: false
- ~~model-router~~ (已移除)

# 统计检验方法指南

> 论文实验常用的统计检验方法速查

## 检验方法速查表

| 情境 | 推荐检验 | 前提条件 | 效应量 |
|------|---------|---------|-------|
| 两组独立样本比较 | Mann-Whitney U | 非正态分布 | r = Z/√N |
| 两组配对样本比较 | Wilcoxon signed-rank | 差值对称分布 | r = Z/√N |
| 多组独立样本比较 | Kruskal-Wallis H | 非正态分布 | ε² |
| 多组配对/重复测量 | Friedman | 非正态分布 | Kendall's W |
| 两组独立正态（方差齐） | 独立样本 t 检验 | 正态 + 方差齐性 | Cohen's d |
| 两组配对正态 | 配对 t 检验 | 差值正态 | Cohen's d |
| 多组独立正态（方差齐） | One-way ANOVA | 正态 + 方差齐性 | η² / ω² |
| 分类（2×2） | χ² 检验 / Fisher exact | 期望频数 ≥ 5 | Cramer's V / φ |

## 统计检验在论文中的使用

### 分类任务
- 两方法对比：McNemar's test（配对名义变量）
- 多方法对比：Friedman test + post-hoc Nemenyi
- 报告格式："方法 A 显著优于方法 B (McNemar's test, p < 0.05)"

### 回归任务
- 两方法对比：paired t-test（差值正态）或 Wilcoxon（差值非正态）
- 多方法对比：重复测量 ANOVA 或 Friedman test
- 报告格式："方法 A 的 MSE (0.023 ± 0.005) 显著低于方法 B (0.031 ± 0.006, paired t-test, p = 0.003, Cohen's d = 1.52)"

### 常见错误
- ❌ 不做统计检验直接说"更好"
- ❌ 只报告 p 值不报告效应量
- ❌ p < 0.05 但效应量极小（N 大时常见）
- ❌ 多重比较不做校正（Bonferroni / FDR）

# 竞赛可视化规范

## 全局配置（每个脚本开头必须设置）

```python
import matplotlib.pyplot as plt
import seaborn as sns
sns.set_theme(style='ticks')

plt.rcParams.update({
    'font.family': 'sans-serif',
    'font.size': 11,
    'axes.titlesize': 12,
    'axes.titleweight': 'bold',
    'axes.labelsize': 11,
    'axes.linewidth': 1.2,
    'axes.spines.top': False,
    'axes.spines.right': False,
    'xtick.labelsize': 10,
    'ytick.labelsize': 10,
    'legend.fontsize': 10,
    'legend.frameon': False,
    'figure.dpi': 300,
    'savefig.dpi': 300,
    'savefig.bbox': 'tight',
    'savefig.pad_inches': 0.1,
})
plt.rcParams['font.sans-serif'] = ['SimHei', 'Noto Sans CJK SC', 'Noto Sans SC', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

COLORS = {
    'primary': '#2E5B88',
    'secondary': '#E85D4C',
    'tertiary': '#4A9B7F',
    'neutral': '#7F7F7F',
    'light': '#B8D4E8',
}
FIG_SINGLE = (5, 4)
FIG_DOUBLE = (10, 4)
FIG_WIDE = (8, 3)
FIG_SQUARE = (6, 6)
```

## 图表类型选择

| 数据类型 | 推荐图表 | 避免使用 |
|---------|---------|---------|
| 趋势/时序 | 折线图+置信带 | 纯折线无CI |
| 分布比较 | 箱线图/小提琴图 | 柱状图+误差棒 |
| 相关性 | 散点图+回归线+r值 | 只有散点 |
| 分类对比 | 水平条形图 | 3D柱状图 |
| 参数敏感性 | 热力图/等高线/带阴影折线 | 多条折线堆叠 |
| 后验分布 | 密度图/直方图+KDE | 只有点估计 |

## 严格禁止

- ❌ 3D图表（除非展示真3D数据）
- ❌ 饼图（改用水平条形图）
- ❌ 图表内标题（用论文 caption，不要 `ax.set_title()`）
- ❌ 密集网格线
- ❌ 四边完整边框（只保留左+下）
- ❌ 低分辨率 PNG（用 300dpi，保存为 PNG 即可）

## 必须遵守

- ✅ 去掉上右边框（已通过全局配置实现）
- ✅ 使用统一的 COLORS 配色方案
- ✅ 折线图用 `fill_between` 添加置信带
- ✅ 标注关键统计量（r, p, R²）
- ✅ 子图编号用 (a), (b), (c)
- ✅ 图例无边框（`frameon=False`）
- ✅ 清晰的轴标签（含单位）
- ✅ 图例位置不遮挡数据
- ✅ 参考线标注（如基线、阈值）

## 图片数量建议

| 场景 | 建议数量 |
|------|---------|
| 单个建模问题 | 4-6张 |
| 敏感性分析 | 2-3张 |
| 数据预处理/EDA | 2-3张 |
| 全文合计 | 13-18张 |

---

## 数据特征输出规范

**每张图的绑图代码后，必须用 print() 输出该图的关键数据特征。**

这是因为 Agent 无法"看到"生成的图片，只能看到代码的文本输出。没有数据特征输出，后续写作手只能猜测图片内容，导致论文描述与图片不符。

### 时间序列图

```python
print("【图X数据特征 - 时间序列】")
print(f"   时间范围: {df['date'].min()} 至 {df['date'].max()}")
print(f"   起点值: {y.iloc[0]:,.2f}, 终点值: {y.iloc[-1]:,.2f}")
print(f"   整体趋势: {'上升' if y.iloc[-1] > y.iloc[0] else '下降'}")
print(f"   峰值: {y.max():,.2f}, 谷值: {y.min():,.2f}")
```

### 模型评估图

```python
print("【图X数据特征 - 模型拟合】")
print(f"   R²: {r2:.4f}")
print(f"   MAE: {mae:.4f}, RMSE: {rmse:.4f}, MAPE: {mape:.2f}%")
print(f"   拟合质量: {'优秀' if r2 > 0.9 else '良好' if r2 > 0.7 else '一般'}")
```

### 相关性热力图

```python
print("【图X数据特征 - 相关性】")
print(f"   最强正相关: {var1} vs {var2} (r={max_corr:.3f})")
print(f"   最强负相关: {var3} vs {var4} (r={min_corr:.3f})")
```

### 特征重要性图

```python
print("【图X数据特征 - 特征重要性】")
for i, (feat, imp) in enumerate(importance_df.head(5).values):
    print(f"   {i+1}. {feat}: {imp:.4f}")
```

### 预测图（含置信区间）

```python
print("【图X数据特征 - 预测结果】")
print(f"   点预测值: {prediction:,.2f}")
print(f"   95%置信区间: [{ci_lower:,.2f}, {ci_upper:,.2f}]")
```

### 混淆矩阵

```python
print("【图X数据特征 - 混淆矩阵】")
print(f"   总样本数: {cm.sum()}")
print(f"   总体准确率: {accuracy:.1%}")
```

---

## 非数据图工具选择

| 工具 | 适用场景 |
|------|---------|
| DrawIO | 技术路线图、子问题求解流程图、数据处理 Pipeline、指标体系层次图、模型选择决策树、甘特图、小规模网络拓扑和简单概念框架 |
| TikZ | 需要精确数学标注、公式节点、复杂连线、2D 几何、变量关系、因果路径、模型架构或自定义算法流程的图 |
| Matplotlib/networkx | 节点较多、需要由数据驱动布局或需要标注最优路径/权重的网络图 |
| 生成式图片 | 物理或工程场景示意图（3D 空间几何、圆柱/球体/曲面、无人机/传感器/交通等场景） |

**速查**：需要公式或精确连线时优先 TikZ；需要可编辑流程结构时优先 DrawIO；需要真实场景或复杂 3D 视觉时才考虑生成式图片。

不管使用哪种工具，图中文字都要与论文语言一致，图形要有明确论文用途，并在正文中配套解释。

---

## 图表风格统一要求

- 同类图表风格要统一，颜色要能灰度区分
- 避免过度装饰、阴影和无意义渐变
- 图中文字、坐标轴、图例和 caption 应与论文语言一致
- 图内不要写长标题，标题交给论文 caption

---

## 检查清单

- [ ] 所有图表使用全局 COLORS 配色
- [ ] 无 3D 图表（除非数据本身是 3D）
- [ ] 无饼图
- [ ] 无图内标题（用 caption）
- [ ] 上右边框已去除
- [ ] 图例无边框
- [ ] 每张图有轴标签（含单位）
- [ ] 每张图后有 print 数据特征输出
- [ ] 图表 caption 完整
- [ ] 正文中有图表引导和 ≥3 行分析

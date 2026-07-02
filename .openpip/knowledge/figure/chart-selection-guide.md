# 图表选择指南

根据「表达目的 + 数据类型」匹配最优图表。

## 选择决策树

```
表达目的是什么？
├─ 展示趋势/变化 → 折线图 (line)
├─ 比较类别差异 → 柱状图 (bar)
├─ 展示分布特征 → 箱线图 (box) / 直方图 (histogram)
├─ 分析相关性 → 散点图 (scatter)
├─ 展示矩阵数据 → 热力图 (heatmap)
├─ 多维综合比较 → 雷达图 (radar)
├─ 展示流程/框架 → 框图 (flowchart)
└─ 展示占比组成 → 饼图 (pie) / 堆叠柱状图
```

## 1. 折线图 (Line Chart)

**适用场景**
- 时间序列数据（随时间变化的趋势）
- 连续变量间的函数关系
- 多组数据的趋势对比

**数据要求**
- X 轴：连续变量（时间、温度、浓度等）
- Y 轴：数值型因变量
- 至少 3 个数据点才能体现趋势

**代码模板**
```python
import matplotlib.pyplot as plt
import numpy as np

def plot_line(x, y_series, labels, xlabel='', ylabel='', title=''):
    fig, ax = plt.subplots(figsize=(3.5, 2.6))
    markers = ['o', 's', '^', 'D', 'v']
    for i, (y, label) in enumerate(zip(y_series, labels)):
        ax.plot(x, y, marker=markers[i % len(markers)],
                label=label, linewidth=1.0, markersize=4)
    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    ax.set_title(title)
    ax.legend(frameon=False)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    plt.tight_layout()
    return fig
```

**注意事项**
- 数据点 > 50 时考虑用平滑曲线
- 多于 5 条线时分面（subplot）展示
- 避免 Y 轴不从 0 开始导致的视觉误导（除非有明确说明）

## 2. 柱状图 (Bar Chart)

**适用场景**
- 类别间数值比较
- 离散变量的频次统计
- 分组对比（分组柱状图/堆叠柱状图）

**数据要求**
- X 轴：分类变量（类别名、组别等）
- Y 轴：数值型（均值、计数、百分比等）
- 每组建议 2-8 个类别

**代码模板**
```python
import matplotlib.pyplot as plt
import numpy as np

def plot_bar(categories, values, xlabel='', ylabel='', title='',
             colors=None, grouped_values=None, group_labels=None):
    fig, ax = plt.subplots(figsize=(3.5, 2.6))
    if grouped_values is not None:
        x = np.arange(len(categories))
        width = 0.8 / len(grouped_values)
        for i, (vals, glabel) in enumerate(zip(grouped_values, group_labels)):
            ax.bar(x + i * width - 0.4 + width / 2, vals, width, label=glabel)
        ax.set_xticks(x)
        ax.set_xticklabels(categories)
    else:
        palette = colors or ['#3C5488', '#E64B35', '#00A087', '#4DBBD5']
        ax.bar(categories, values, color=palette[:len(categories)])
    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    ax.set_title(title)
    if grouped_values:
        ax.legend(frameon=False)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    plt.tight_layout()
    return fig
```

**注意事项**
- 有误差数据时添加误差线 (`yerr=`)
- 类别名过长时旋转 X 轴标签或改为水平柱状图
- 堆叠柱状图用于展示组成，分组柱状图用于对比

## 3. 箱线图 (Box Plot)

**适用场景**
- 展示数据分布（中位数、四分位、异常值）
- 多组数据分布对比
- 识别异常值

**数据要求**
- 每组至少 5 个数据点
- 数值型连续数据

**代码模板**
```python
import matplotlib.pyplot as plt
import numpy as np

def plot_box(data_groups, labels, xlabel='', ylabel='', title=''):
    fig, ax = plt.subplots(figsize=(3.5, 2.6))
    bp = ax.boxplot(data_groups, labels=labels, patch_artist=True,
                    boxprops=dict(facecolor='#E8E8E8', edgecolor='black'),
                    medianprops=dict(color='black'),
                    whiskerprops=dict(color='black'),
                    capprops=dict(color='black'),
                    flierprops=dict(marker='o', markersize=3))
    palette = ['#3C5488', '#E64B35', '#00A087', '#4DBBD5']
    for patch, color in zip(bp['boxes'], palette):
        patch.set_facecolor(color)
        patch.set_alpha(0.6)
    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    ax.set_title(title)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    plt.tight_layout()
    return fig
```

**注意事项**
- 数据点 < 5 时改用散点图
- 异常值需单独说明判定标准（如 1.5×IQR）

## 4. 直方图 (Histogram)

**适用场景**
- 单变量频率分布
- 数据正态性检验的可视化
- 多组分布叠加对比

**数据要求**
- 数值型连续数据
- 至少 20 个数据点

**代码模板**
```python
import matplotlib.pyplot as plt
import numpy as np

def plot_histogram(data, bins=20, xlabel='', ylabel='频次', title='',
                   histtype='bar', alpha=0.7):
    fig, ax = plt.subplots(figsize=(3.5, 2.6))
    if isinstance(data, list) and isinstance(data[0], np.ndarray):
        labels = [f'Group {i+1}' for i in range(len(data))]
        ax.hist(data, bins=bins, label=labels, alpha=alpha,
                edgecolor='white', linewidth=0.5)
        ax.legend(frameon=False)
    else:
        ax.hist(data, bins=bins, color='#3C5488', alpha=alpha,
                edgecolor='white', linewidth=0.5)
    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    ax.set_title(title)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    plt.tight_layout()
    return fig
```

**注意事项**
- `bins` 数量选择：Sturges 公式 `k = ceil(log2(n) + 1)`
- 多组叠加时用半透明 (`alpha`) 避免遮挡

## 5. 散点图 (Scatter Plot)

**适用场景**
- 两个连续变量的相关性分析
- 回归拟合的可视化
- 聚类结果展示

**数据要求**
- X、Y 均为数值型
- 至少 10 个数据点

**代码模板**
```python
import matplotlib.pyplot as plt
import numpy as np

def plot_scatter(x, y, xlabel='', ylabel='', title='',
                 color=None, size=20, alpha=0.6, show_fit=False):
    fig, ax = plt.subplots(figsize=(3.5, 2.6))
    ax.scatter(x, y, c=color or '#3C5488', s=size, alpha=alpha,
               edgecolors='white', linewidth=0.3)
    if show_fit:
        z = np.polyfit(x, y, 1)
        p = np.poly1d(z)
        x_line = np.linspace(min(x), max(x), 100)
        ax.plot(x_line, p(x_line), '--', color='#E64B35', linewidth=1)
    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    ax.set_title(title)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    plt.tight_layout()
    return fig
```

**注意事项**
- 数据点 > 500 时用 `alpha` 或 hexbin 避免过度绘制
- 添加回归线时标注 R² 值

## 6. 热力图 (Heatmap)

**适用场景**
- 相关性矩阵可视化
- 混淆矩阵
- 时空数据展示
- 基因表达矩阵

**数据要求**
- 二维矩阵数据
- 值为数值型

**代码模板**
```python
import matplotlib.pyplot as plt
import numpy as np

def plot_heatmap(matrix, row_labels=None, col_labels=None,
                 xlabel='', ylabel='', title='', cmap='RdYlBu_r'):
    fig, ax = plt.subplots(figsize=(3.5, 3.0))
    im = ax.imshow(matrix, cmap=cmap, aspect='auto')
    plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    if row_labels:
        ax.set_yticks(range(len(row_labels)))
        ax.set_yticklabels(row_labels)
    if col_labels:
        ax.set_xticks(range(len(col_labels)))
        ax.set_xticklabels(col_labels, rotation=45, ha='right')
    for i in range(matrix.shape[0]):
        for j in range(matrix.shape[1]):
            ax.text(j, i, f'{matrix[i, j]:.2f}',
                    ha='center', va='center', fontsize=7)
    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    ax.set_title(title)
    plt.tight_layout()
    return fig
```

**注意事项**
- 格式化数值标注 (`:.2f`) 保持一致性
- 大矩阵考虑聚类后展示
- 色盲友好：避免纯红-绿配色

## 7. 雷达图 (Radar Chart)

**适用场景**
- 多指标综合评价
- 个体/方法的多维能力对比
- 优缺点综合展示

**数据要求**
- 3-8 个维度（太少不如柱状图，太多太拥挤）
- 各维度数值归一化到相同尺度

**代码模板**
```python
import matplotlib.pyplot as plt
import numpy as np

def plot_radar(categories, values_series, labels, title='',
               ylim=(0, 1), colors=None):
    N = len(categories)
    angles = np.linspace(0, 2 * np.pi, N, endpoint=False).tolist()
    angles += angles[:1]
    fig, ax = plt.subplots(figsize=(3.5, 3.0), subplot_kw=dict(polar=True))
    palette = colors or ['#3C5488', '#E64B35', '#00A087']
    for i, (vals, label) in enumerate(zip(values_series, labels)):
        vals = vals + vals[:1]
        ax.plot(angles, vals, 'o-', linewidth=1, label=label,
                color=palette[i % len(palette)])
        ax.fill(angles, vals, alpha=0.1, color=palette[i % len(palette)])
    ax.set_thetagrids(np.degrees(angles[:-1]), categories, fontsize=8)
    ax.set_ylim(ylim)
    ax.set_title(title, fontsize=9, pad=15)
    ax.legend(loc='upper right', bbox_to_anchor=(1.3, 1.1), frameon=False, fontsize=7)
    plt.tight_layout()
    return fig
```

**注意事项**
- 所有维度需归一化（否则面积失真）
- 超过 3 组数据时改为分面

## 8. 框图 (Flowchart / Framework)

**适用场景**
- 方法流程展示
- 系统架构描述
- 算法步骤

**数据要求**
- 无结构化数据要求
- 需要定义节点和连接关系

**代码模板**
```python
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches

def plot_flowchart(nodes, edges, title=''):
    fig, ax = plt.subplots(figsize=(5, 4))
    ax.set_xlim(-1, 10)
    ax.set_ylim(-1, 8)
    ax.axis('off')
    for node in nodes:
        x, y, text, shape = node['x'], node['y'], node['text'], node.get('shape', 'rect')
        if shape == 'rect':
            patch = mpatches.FancyBboxPatch((x - 1.2, y - 0.4), 2.4, 0.8,
                                            boxstyle="round,pad=0.1",
                                            facecolor='#E8E8E8', edgecolor='black',
                                            linewidth=0.8)
        elif shape == 'diamond':
            patch = mpatches.RegularPolygon((x, y), 4, radius=0.7,
                                            facecolor='#F5F5F5', edgecolor='black',
                                            linewidth=0.8)
        else:
            patch = mpatches.Ellipse((x, y), 2.4, 0.8,
                                     facecolor='#E8E8E8', edgecolor='black',
                                     linewidth=0.8)
        ax.add_patch(patch)
        ax.text(x, y, text, ha='center', va='center', fontsize=8)
    for edge in edges:
        x1, y1, x2, y2 = edge['from_x'], edge['from_y'], edge['to_x'], edge['to_y']
        ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
                    arrowprops=dict(arrowstyle='->', lw=0.8, color='black'))
        if 'label' in edge:
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2
            ax.text(mx + 0.1, my, edge['label'], fontsize=7, color='gray')
    ax.set_title(title, fontsize=9)
    plt.tight_layout()
    return fig
```

**注意事项**
- 保持节点对齐，箭头方向一致
- 节点内文字简短（≤ 6 个字）
- 复杂流程考虑分层

## 9. 饼图 (Pie Chart)

**适用场景**
- 占比/组成展示
- 类别 ≤ 6 个

**数据要求**
- 各部分之和应为 100%
- 类别不宜过多

**注意事项**
- 学术论文中优先用堆叠柱状图替代饼图
- 如必须使用，添加百分比标注

## 10. 误差线图 (Error Bar)

**适用场景**
- 均值 ± 标准差/标准误展示
- 多组精度对比

**代码模板**
```python
import matplotlib.pyplot as plt
import numpy as np

def plot_errorbar(categories, means, errors, xlabel='', ylabel='', title=''):
    fig, ax = plt.subplots(figsize=(3.5, 2.6))
    ax.errorbar(categories, means, yerr=errors, fmt='o-', capsize=3,
                color='#3C5488', markersize=5, linewidth=1)
    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    ax.set_title(title)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    plt.tight_layout()
    return fig
```

## 通用注意事项

1. **尺寸优先**：先确定单栏/双栏，再选图表类型
2. **颜色 ≤ 8**：超过 8 种改用分面或交互式图表
3. **图例精简**：标注名称不超过 4 个汉字或 8 个英文字符
4. **坐标轴**：必须有标签和单位，零点需明确
5. **一致性**：同一论文内相同数据系列使用相同颜色/标记

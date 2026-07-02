# 公式规范

## LaTeX 语法
- 行内：`$...$`  独立：`$$...$$`  编号：`\begin{equation}...\end{equation}`

## 机械工程符号

### 运动学
ω(角速度) `\omega`  α(角加速度) `\alpha`  v(线速度)  a(线加速度)  θ(转角) `\theta`

### 力学
F(力)  M(力矩)  σ(应力) `\sigma`  ε(应变) `\epsilon`  E(弹性模量)  ν(泊松比) `\nu`

### 机构学
F(自由度)  P_L(低副)  P_H(高副)  n(活动构件)  i(传动比)  η(效率) `\eta`

### 常用公式

#### 机构学
- $F = 3n - 2P_L - P_H$（自由度）
  - n: 活动构件数, P_L: 低副数, P_H: 高副数
- $K = N(N-1)/2$（瞬心数）
  - N: 构件总数
- $v_B = v_A + v_{BA}$（速度）
- $a_k = 2\omega \cdot v_r$（哥氏加速度）
  - ω: 角速度, v_r: 相对速度
- $F_I = -ma_S$（惯性力）
  - m: 质量, a_S: 质心加速度

#### 材料力学
- $\sigma = \frac{F}{A}$（正应力）
  - F: 轴向力, A: 截面面积
- $\tau = \frac{V}{A}$（剪应力）
  - V: 剪力, A: 截面面积
- $\sigma_b = \frac{My}{I_z}$（弯曲正应力）
  - M: 弯矩, y: 到中性轴距离, I_z: 惯性矩
- $\tau_{max} = \frac{T}{W_t}$（扭转剪应力）
  - T: 扭矩, W_t: 抗扭截面系数
- $\delta = \frac{FL^3}{3EI}$（悬臂梁自由端挠度）
  - F: 集中力, L: 梁长, E: 弹性模量, I: 惯性矩
- $\sigma_{eq} = \sqrt{\sigma^2 + 3\tau^2}$（von Mises等效应力）
  - σ: 正应力, τ: 剪应力
- $S = \frac{\sigma_{-1}}{\sigma_a K_\sigma + \sigma_m}$（疲劳安全系数）
  - σ_{-1}: 对称循环疲劳极限, σ_a: 应力幅, K_σ: 有效应力集中系数, σ_m: 平均应力
- $\frac{d\varepsilon}{dt} = \frac{\sigma}{\eta} \exp\left(-\frac{Q}{RT}\right)$（蠕变速率方程，Norton定律）
  - ε: 应变, σ: 应力, η: 材料常数, Q: 激活能, R: 气体常数, T: 绝对温度

#### 流体力学
- $\rho A_1 v_1 = \rho A_2 v_2$（连续性方程）
  - ρ: 流体密度, A: 截面面积, v: 流速
- $p + \frac{1}{2}\rho v^2 + \rho gh = \text{const}$（伯努利方程）
  - p: 静压, ρ: 密度, v: 流速, g: 重力加速度, h: 高度
- $\rho\left(\frac{\partial \mathbf{v}}{\partial t} + \mathbf{v} \cdot \nabla \mathbf{v}\right) = -\nabla p + \mu \nabla^2 \mathbf{v} + \rho \mathbf{g}$（纳维斯托克斯方程）
  - v: 速度矢量, p: 压力, μ: 动力粘度, g: 重力加速度
- $Re = \frac{\rho v L}{\mu}$（雷诺数）
  - ρ: 密度, v: 特征速度, L: 特征长度, μ: 动力粘度
- $Nu = \frac{hL}{k}$（努塞尔数）
  - h: 对流换热系数, L: 特征长度, k: 导热系数
- $f = \frac{\Delta p}{\frac{L}{D} \cdot \frac{1}{2}\rho v^2}$（达西摩擦系数）
  - Δp: 压力损失, L: 管长, D: 管径, ρ: 密度, v: 流速
- $\tau_w = \mu \frac{\partial u}{\partial y}\bigg|_{y=0}$（壁面剪应力）
  - μ: 动力粘度, u: 速度, y: 到壁面距离

#### 控制工程
- $G(s) = \frac{Y(s)}{U(s)}$（传递函数）
  - Y(s): 输出拉普拉斯变换, U(s): 输入拉普拉斯变换, s: 复频率
- $u(t) = K_p e(t) + K_i \int_0^t e(\tau)d\tau + K_d \frac{de(t)}{dt}$（PID控制律）
  - K_p: 比例增益, K_i: 积分增益, K_d: 微分增益, e(t): 误差
- $\dot{\mathbf{x}} = \mathbf{A}\mathbf{x} + \mathbf{B}\mathbf{u}$, $\mathbf{y} = \mathbf{C}\mathbf{x} + \mathbf{D}\mathbf{u}$（状态空间方程）
  - x: 状态向量, u: 输入向量, y: 输出向量, A,B,C,D: 系统矩阵
- $J = \int_0^\infty \left(\mathbf{x}^T Q \mathbf{x} + \mathbf{u}^T R \mathbf{u}\right) dt$（LQR代价函数）
  - Q: 状态权重矩阵, R: 控制权重矩阵
- $s^2 + 2\zeta\omega_n s + \omega_n^2 = 0$（二阶系统特征方程）
  - ζ: 阻尼比, ω_n: 自然频率
- $\%OS = e^{-\zeta\pi/\sqrt{1-\zeta^2}} \times 100\%$（超调量）
  - ζ: 阻尼比
- $t_s \approx \frac{4}{\zeta\omega_n}$（调节时间，2%准则）
  - ζ: 阻尼比, ω_n: 自然频率

#### 热力学与传热
- $q = -k\frac{dT}{dx}$（傅里叶导热定律）
  - q: 热通量, k: 导热系数, T: 温度, x: 方向坐标
- $Q = hA(T_s - T_\infty)$（牛顿冷却定律）
  - h: 对流换热系数, A: 换热面积, T_s: 壁面温度, T_∞: 流体温度
- $Q = \sigma \varepsilon A(T_1^4 - T_2^4)$（Stefan-Boltzmann辐射定律）
  - σ: Stefan-Boltzmann常数, ε: 发射率, A: 辐射面积, T: 绝对温度
- $\frac{\partial T}{\partial t} = \alpha \nabla^2 T$（热传导方程）
  - α: 热扩散率, T: 温度, t: 时间
- $\alpha = \frac{k}{\rho c_p}$（热扩散率）
  - k: 导热系数, ρ: 密度, c_p: 比定压热容
- $Re \cdot Pr = \frac{\rho v c_p L}{k}$（Péclet数）
  - ρ: 密度, v: 流速, c_p: 比热容, L: 特征长度, k: 导热系数
- $\eta_{th} = 1 - \frac{T_L}{T_H}$（卡诺热效率）
  - T_L: 低温热源温度, T_H: 高温热源温度
- $\dot{Q} = \dot{m} c_p \Delta T$（对流换热速率）
  - ṁ: 质量流量, c_p: 比热容, ΔT: 温差

## 排版规则
1. 变量斜体，单位正体
2. 矩阵/向量粗体
3. 编号右对齐 (1), (2)...
4. 变量首次出现必须定义
5. 希腊字母用对应LaTeX命令
6. 运算符用正体（sin, cos, log, d/dx）
7. 多行公式对齐用 aligned 环境

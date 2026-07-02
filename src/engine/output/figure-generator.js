const { writeFileSync, existsSync, mkdirSync, unlinkSync } = require('fs');
const { resolve } = require('path');
const { execSync, execFileSync } = require('child_process');

const { generateId, loadYaml, loadJsonFile } = require('../utils');
const { scanFigureAnnotations: scanAnnotations, parseFigureAnnotation: parseAnnotation } = require('./figure-linker');

// ============================================================
// 学术安全色板
// ============================================================

const ACADEMIC_PALETTE = {
  color: ['#3C5488', '#E64B35', '#00A087', '#4DBBD5', '#F39B7F', '#8491B4', '#91D1C2', '#000000'],
  grayscale: ['#000000', '#404040', '#808080', '#B0B0B0', '#D0D0D0'],
};

const MARKERS = ['o', 's', '^', 'D', 'v', 'p', '*', 'h'];

// ============================================================
// FIGURE 标注解析器（复用 figure-linker）
// ============================================================

function scanFigureAnnotations(markdownContent) {
  return scanAnnotations(markdownContent);
}

function parseFigureAnnotation(raw) {
  return parseAnnotation(raw);
}

// ============================================================
// Python 代码生成器
// ============================================================

function generatePythonCode(spec, style = {}) {
  const chartType = spec.type || 'line';
  const title = spec.title || '';
  const xlabel = spec.xlabel || '';
  const ylabel = spec.ylabel || '';
  const data = spec.data || {};

  const palette = style.palette || ACADEMIC_PALETTE.color;
  const fontFamily = style.fontFamily || 'serif';
  const fontSize = style.fontSize || 10;
  const dpi = style.dpi || 300;

  const lines = [];
  lines.push('import matplotlib.pyplot as plt');
  lines.push('import numpy as np');
  lines.push('');
  lines.push('# ── Style Setup ──');
  lines.push(`plt.rcParams['font.family'] = '${fontFamily}'`);
  lines.push(`plt.rcParams['font.size'] = ${fontSize}`);
  lines.push("plt.rcParams['axes.unicode_minus'] = False");
  lines.push("plt.rcParams['pdf.fonttype'] = 42");
  lines.push("plt.rcParams['ps.fonttype'] = 42");
  lines.push('');
  lines.push(`PALETTE = ${JSON.stringify(palette)}`);
  lines.push('');

  switch (chartType) {
  case 'line':
    lines.push(generateLinePlot(data, title, xlabel, ylabel));
    break;
  case 'bar':
    lines.push(generateBarPlot(data, title, xlabel, ylabel));
    break;
  case 'scatter':
    lines.push(generateScatterPlot(data, title, xlabel, ylabel));
    break;
  case 'box':
    lines.push(generateBoxPlot(data, title, xlabel, ylabel));
    break;
  case 'histogram':
    lines.push(generateHistogram(data, title, xlabel, ylabel));
    break;
  case 'heatmap':
    lines.push(generateHeatmap(data, title, xlabel, ylabel));
    break;
  case 'radar':
    lines.push(generateRadar(data, title));
    break;
  case 'errorbar':
    lines.push(generateErrorbar(data, title, xlabel, ylabel));
    break;
  default:
    lines.push(generateLinePlot(data, title, xlabel, ylabel));
  }

  // 添加保存代码
  lines.push('');
  lines.push('# ── Save ──');
  lines.push('plt.tight_layout()');
  lines.push(`plt.savefig('${'{output_pdf}'}', dpi=${dpi}, bbox_inches='tight')`);
  lines.push(`plt.savefig('${'{output_png}'}', dpi=${dpi}, bbox_inches='tight')`);
  lines.push('plt.close()');

  return lines.join('\n');
}

function generateLinePlot(data, title, xlabel, ylabel) {
  const x = data.x || `list(range(${(data.y && data.y.length) || 5}))`;
  const ySeries = data.y ? (Array.isArray(data.y[0]) ? data.y : [data.y]) : [[]];
  const labels = data.labels || ySeries.map((_, i) => `Series ${i + 1}`);

  let code = `fig, ax = plt.subplots(figsize=(${3.5}, ${2.6}))\n`;
  code += `x = np.array(${JSON.stringify(x)})\n`;
  ySeries.forEach((y, i) => {
    code += `ax.plot(x, np.array(${JSON.stringify(y)}), marker='${MARKERS[i % MARKERS.length]}', `;
    code += `color=PALETTE[${i % 8}], label='${labels[i]}', linewidth=1.0, markersize=4)\n`;
  });
  code += `ax.set_xlabel('${xlabel}')\n`;
  code += `ax.set_ylabel('${ylabel}')\n`;
  code += `ax.set_title('${title}')\n`;
  if (labels.length > 1) {
    code += `ax.legend(frameon=False, fontsize=${8})\n`;
  }
  code += 'ax.spines[\'top\'].set_visible(False)\n';
  code += 'ax.spines[\'right\'].set_visible(False)\n';
  return code;
}

function generateBarPlot(data, title, xlabel, ylabel) {
  const labels = data.labels || ['A', 'B', 'C'];
  const values = data.values || [1, 2, 3];
  const grouped = data.grouped || null;

  let code = `fig, ax = plt.subplots(figsize=(${3.5}, ${2.6}))\n`;
  if (grouped) {
    code += `x = np.arange(${labels.length})\n`;
    code += `width = 0.8 / ${grouped.length}\n`;
    grouped.forEach((vals, i) => {
      code += `ax.bar(x + ${i} * width - 0.4 + width / 2, ${JSON.stringify(vals)}, width, `;
      code += `color=PALETTE[${i % 8}], label='${data.groupLabels ? data.groupLabels[i] : `Group ${i + 1}`}')\n`;
    });
    code += 'ax.set_xticks(x)\n';
    code += `ax.set_xticklabels(${JSON.stringify(labels)})\n`;
    code += 'ax.legend(frameon=False)\n';
  } else {
    code += `ax.bar(${JSON.stringify(labels)}, ${JSON.stringify(values)}, `;
    code += `color=[PALETTE[i % 8] for i in range(${labels.length})])\n`;
  }
  code += `ax.set_xlabel('${xlabel}')\n`;
  code += `ax.set_ylabel('${ylabel}')\n`;
  code += `ax.set_title('${title}')\n`;
  code += 'ax.spines[\'top\'].set_visible(False)\n';
  code += 'ax.spines[\'right\'].set_visible(False)\n';
  return code;
}

function generateScatterPlot(data, title, xlabel, ylabel) {
  const x = data.x || [1, 2, 3, 4, 5];
  const y = data.y || [1, 4, 2, 5, 3];

  let code = `fig, ax = plt.subplots(figsize=(${3.5}, ${2.6}))\n`;
  code += `ax.scatter(${JSON.stringify(x)}, ${JSON.stringify(y)}, `;
  code += 'c=PALETTE[0], s=20, alpha=0.6, edgecolors=\'white\', linewidth=0.3)\n';
  if (data.showFit) {
    code += `z = np.polyfit(${JSON.stringify(x)}, ${JSON.stringify(y)}, 1)\n`;
    code += 'p = np.poly1d(z)\n';
    code += `x_line = np.linspace(min(${JSON.stringify(x)}), max(${JSON.stringify(x)}), 100)\n`;
    code += 'ax.plot(x_line, p(x_line), \'--\', color=PALETTE[1], linewidth=1)\n';
  }
  code += `ax.set_xlabel('${xlabel}')\n`;
  code += `ax.set_ylabel('${ylabel}')\n`;
  code += `ax.set_title('${title}')\n`;
  code += 'ax.spines[\'top\'].set_visible(False)\n';
  code += 'ax.spines[\'right\'].set_visible(False)\n';
  return code;
}

function generateBoxPlot(data, title, xlabel, ylabel) {
  const groups = data.groups || [[1, 2, 3, 4, 5]];
  const labels = data.labels || groups.map((_, i) => `Group ${i + 1}`);

  let code = `fig, ax = plt.subplots(figsize=(${3.5}, ${2.6}))\n`;
  code += `bp = ax.boxplot(${JSON.stringify(groups)}, labels=${JSON.stringify(labels)}, `;
  code += `patch_artist=True, boxprops=dict(facecolor='${ACADEMIC_PALETTE.color[0]}', alpha=0.6), `;
  code += 'medianprops=dict(color=\'black\'), whiskerprops=dict(color=\'black\'), ';
  code += 'capprops=dict(color=\'black\'))\n';
  code += `ax.set_xlabel('${xlabel}')\n`;
  code += `ax.set_ylabel('${ylabel}')\n`;
  code += `ax.set_title('${title}')\n`;
  code += 'ax.spines[\'top\'].set_visible(False)\n';
  code += 'ax.spines[\'right\'].set_visible(False)\n';
  return code;
}

function generateHistogram(data, title, xlabel, ylabel) {
  const values = data.values || [1, 2, 3, 4, 5, 5, 4, 3, 2, 1];
  const bins = data.bins || 10;

  let code = `fig, ax = plt.subplots(figsize=(${3.5}, ${2.6}))\n`;
  code += `ax.hist(${JSON.stringify(values)}, bins=${bins}, color=PALETTE[0], `;
  code += 'alpha=0.7, edgecolor=\'white\', linewidth=0.5)\n';
  code += `ax.set_xlabel('${xlabel}')\n`;
  code += `ax.set_ylabel('${ylabel || 'Frequency'}')\n`;
  code += `ax.set_title('${title}')\n`;
  code += 'ax.spines[\'top\'].set_visible(False)\n';
  code += 'ax.spines[\'right\'].set_visible(False)\n';
  return code;
}

function generateHeatmap(data, title, xlabel, ylabel) {
  const matrix = data.matrix || [[1, 0.5], [0.5, 1]];
  const rowLabels = data.rowLabels || null;
  const colLabels = data.colLabels || null;

  let code = `fig, ax = plt.subplots(figsize=(${3.5}, ${3.0}))\n`;
  code += `matrix = np.array(${JSON.stringify(matrix)})\n`;
  code += 'im = ax.imshow(matrix, cmap=\'RdYlBu_r\', aspect=\'auto\')\n';
  code += 'plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04)\n';
  if (rowLabels) {
    code += `ax.set_yticks(range(${rowLabels.length}))\n`;
    code += `ax.set_yticklabels(${JSON.stringify(rowLabels)})\n`;
  }
  if (colLabels) {
    code += `ax.set_xticks(range(${colLabels.length}))\n`;
    code += `ax.set_xticklabels(${JSON.stringify(colLabels)}, rotation=45, ha='right')\n`;
  }
  code += 'for i in range(matrix.shape[0]):\n';
  code += '    for j in range(matrix.shape[1]):\n';
  code += '        ax.text(j, i, f\'{matrix[i, j]:.2f}\', ha=\'center\', va=\'center\', fontsize=7)\n';
  code += `ax.set_xlabel('${xlabel}')\n`;
  code += `ax.set_ylabel('${ylabel}')\n`;
  code += `ax.set_title('${title}')\n`;
  return code;
}

function generateRadar(data, title) {
  const categories = data.categories || ['A', 'B', 'C', 'D', 'E'];
  const values = data.values || [[0.8, 0.6, 0.9, 0.7, 0.5]];
  const labels = data.labels || ['Method'];

  let code = `N = ${categories.length}\n`;
  code += 'angles = np.linspace(0, 2 * np.pi, N, endpoint=False).tolist()\n';
  code += 'angles += angles[:1]\n';
  code += `fig, ax = plt.subplots(figsize=(${3.5}, ${3.0}), subplot_kw=dict(polar=True))\n`;
  values.forEach((vals, i) => {
    code += `vals_${i} = ${JSON.stringify(vals)} + [${JSON.stringify(vals)[0]}]\n`;
    code += `ax.plot(angles, vals_${i}, 'o-', linewidth=1, label='${labels[i]}', color=PALETTE[${i % 8}])\n`;
    code += `ax.fill(angles, vals_${i}, alpha=0.1, color=PALETTE[${i % 8}])\n`;
  });
  code += `ax.set_thetagrids(np.degrees(angles[:-1]), ${JSON.stringify(categories)}, fontsize=8)\n`;
  code += `ax.set_title('${title}', fontsize=9, pad=15)\n`;
  code += 'ax.legend(loc=\'upper right\', bbox_to_anchor=(1.3, 1.1), frameon=False, fontsize=7)\n';
  return code;
}

function generateErrorbar(data, title, xlabel, ylabel) {
  const categories = data.categories || ['A', 'B', 'C'];
  const means = data.means || [1, 2, 3];
  const errors = data.errors || [0.1, 0.2, 0.15];

  let code = `fig, ax = plt.subplots(figsize=(${3.5}, ${2.6}))\n`;
  code += `ax.errorbar(${JSON.stringify(categories)}, ${JSON.stringify(means)}, `;
  code += `yerr=${JSON.stringify(errors)}, fmt='o-', capsize=3, `;
  code += 'color=PALETTE[0], markersize=5, linewidth=1)\n';
  code += `ax.set_xlabel('${xlabel}')\n`;
  code += `ax.set_ylabel('${ylabel}')\n`;
  code += `ax.set_title('${title}')\n`;
  code += 'ax.spines[\'top\'].set_visible(False)\n';
  code += 'ax.spines[\'right\'].set_visible(False)\n';
  return code;
}

// ============================================================
// 图注生成器
// ============================================================

function generateCaption(spec, style = {}) {
  const format = style.captionFormat || 'fig {number}. {description}';
  const number = spec.number || 1;
  const title = spec.title || '';

  let caption = format
    .replace('{number}', number)
    .replace('{description}', title);

  if (spec.notes) {
    caption += ' ' + spec.notes;
  }

  return caption;
}

// ============================================================
// FigureRegistry：图表注册表，维护图表元数据与数据哈希的双向绑定
// ============================================================

class FigureRegistry {
  constructor(projectDir) {
    this.projectDir = projectDir;
    this.registryPath = resolve(projectDir, 'figures', 'figure-registry.json');
    this.entries = this._load();
  }

  _load() {
    return loadJsonFile(this.registryPath, { version: 1, figures: [] });
  }

  _save() {
    try {
      if (!existsSync(resolve(this.projectDir, 'figures'))) {
        mkdirSync(resolve(this.projectDir, 'figures'), { recursive: true });
      }
      writeFileSync(this.registryPath, JSON.stringify(this.entries, null, 2), 'utf-8');
    } catch {}
  }

  register(figId, spec, result) {
    const dataHash = this._hashData(spec.data || {});
    const existing = this.entries.figures.findIndex(f => f.id === figId);
    const entry = {
      id: figId,
      number: spec.number || 1,
      title: spec.title || '',
      type: spec.type || 'line',
      dataHash,
      dataDescription: spec.data ? JSON.stringify(spec.data).slice(0, 200) : '',
      style: spec.style || 'ieee',
      generatedAt: new Date().toISOString(),
      pyPath: result.pyPath || '',
      pdfPath: result.pdfPath || '',
      pngPath: result.pngPath || '',
      caption: result.caption || '',
      success: result.success || false,
    };
    if (existing >= 0) {
      this.entries.figures[existing] = entry;
    } else {
      this.entries.figures.push(entry);
    }
    this._save();
    return entry;
  }

  findStale(draftContent) {
    const stale = [];
    for (const fig of this.entries.figures) {
      const inContent = draftContent.includes(`图${fig.number}`) || draftContent.includes(`Fig. ${fig.number}`);
      if (!inContent) {
        stale.push({ ...fig, reason: '正文中已无引用' });
      }
    }
    return stale;
  }

  getNeedsRegeneration(spec) {
    const dataHash = this._hashData(spec.data || {});
    const existing = this.entries.figures.find(f => f.number === (spec.number || 1) && f.type === (spec.type || 'line'));
    if (!existing) return true;
    return existing.dataHash !== dataHash;
  }

  getSummary() {
    const total = this.entries.figures.length;
    const success = this.entries.figures.filter(f => f.success).length;
    return { total, success, figures: this.entries.figures };
  }

  _hashData(data) {
    try {
      const crypto = require('crypto');
      return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex').slice(0, 8);
    } catch {
      return String(Date.now());
    }
  }
}

// ============================================================
// Python 运行时检测
// ============================================================

let _pythonChecked = false;
let _pythonAvailable = false;
let _pythonCmd = 'python';

function detectPython() {
  if (_pythonChecked) return _pythonAvailable;
  _pythonChecked = true;
  for (const cmd of ['python3', 'python', 'py']) {
    try {
      execFileSync(cmd, ['--version'], { timeout: 5000, stdio: 'pipe' });
      _pythonCmd = cmd;
      _pythonAvailable = true;
      return true;
    } catch {}
  }
  _pythonAvailable = false;
  return false;
}

function ensurePythonDeps() {
  if (!detectPython()) return { available: false, error: 'Python 未安装' };
  try {
    execFileSync(_pythonCmd, ['-c', 'import matplotlib; import numpy'], { timeout: 10000, stdio: 'pipe' });
    return { available: true };
  } catch {
    return { available: false, error: '缺少 matplotlib 或 numpy，请执行: pip install matplotlib numpy' };
  }
}

// ============================================================
// FigureGenerator 主类
// ============================================================

class FigureGenerator {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.figuresDir = resolve(projectRoot, 'figures');
    this.styleTemplates = this._loadStyleTemplates();
  }

  _loadStyleTemplates() {
    const templatePath = resolve(this.projectRoot, '.openpip', 'knowledge', 'figure', 'style-templates.yaml');
    const result = loadYaml(templatePath, null);
    return result !== null ? result : this._defaultTemplates();
  }

  _defaultTemplates() {
    return {
      ieee: {
        font: { family: 'Times New Roman', size_pt: 10 },
        colors: { palette: ACADEMIC_PALETTE.grayscale },
        dpi: { vector: 300, raster: 600 },
        figure: { width_single: 3.5, height_ratio: 0.75 },
        caption: { format: 'Fig. {number}. {description}', font_size_pt: 9 },
      },
      nature: {
        font: { family: 'Arial', size_pt: 8 },
        colors: { palette: ['#E64B35', '#4DBBD5', '#00A087', '#3C5488', '#F39B7F'] },
        dpi: { vector: 300, raster: 600 },
        figure: { width_single: 3.5, height_ratio: 0.65 },
        caption: { format: '**Figure {number}** | {description}', font_size_pt: 8 },
      },
      chinese_journal: {
        font: { family: 'SimSun', size_pt: 9, label_family: 'SimHei' },
        colors: { palette: ACADEMIC_PALETTE.color.slice(0, 6) },
        dpi: { vector: 300, raster: 300 },
        figure: { width_single: 8.0, height_ratio: 0.65 },
        caption: { format: '图 {number} {description}', font_size_pt: 9 },
      },
      thesis: {
        font: { family: 'SimSun', size_pt: 10.5, label_family: 'SimHei' },
        colors: { palette: ACADEMIC_PALETTE.color },
        dpi: { vector: 300, raster: 300 },
        figure: { width_single: 8.0, height_ratio: 0.70 },
        caption: { format: '图 {chapter}.{number} {description}', font_size_pt: 10.5 },
      },
    };
  }

  getStyle(styleName) {
    return this.styleTemplates[styleName] || this.styleTemplates.ieee;
  }

  ensureFiguresDir() {
    if (!existsSync(this.figuresDir)) {
      mkdirSync(this.figuresDir, { recursive: true });
    }
  }

  generateFromSpec(spec, outputDir) {
    this.ensureFiguresDir();
    const outDir = outputDir || this.figuresDir;
    if (!existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true });
    }

    const styleName = spec.style || 'ieee';
    const style = this.getStyle(styleName);
    const figId = spec.id || generateId('fig');
    const number = spec.number || 1;

    // 注册表检查是否需要重生成
    const registry = new FigureRegistry(resolve(this.projectRoot, 'papers'));
    if (!registry.getNeedsRegeneration(spec)) {
      const existingFig = registry.entries.figures.find(f => f.number === number && f.type === (spec.type || 'line'));
      if (existingFig && existingFig.pdfPath && existsSync(existingFig.pdfPath)) {
        console.log(`  📋 图${number} 数据未变，跳过重生成`);
        return { ...existingFig, cached: true };
      }
    }

    // 生成 Python 代码
    const pythonCode = this.generatePythonCode(spec, {
      palette: style.colors.palette,
      fontFamily: style.font.family,
      fontSize: style.font.size_pt,
      dpi: style.dpi.vector,
      figWidth: style.figure.width_single,
      figHeight: style.figure.width_single * style.figure.height_ratio,
    });

    // 替换输出路径
    const outputPdf = resolve(outDir, `${figId}.pdf`);
    const outputPng = resolve(outDir, `${figId}.png`);
    const finalCode = pythonCode
      .replace('{output_pdf}', outputPdf.replace(/\\/g, '/'))
      .replace('{output_png}', outputPng.replace(/\\/g, '/'));

    // 写入 .py 文件
    const pyPath = resolve(outDir, `${figId}.py`);
    writeFileSync(pyPath, finalCode, 'utf-8');

    // 生成图注
    const caption = this.generateCaption({ ...spec, number }, {
      captionFormat: style.caption.format,
    });
    const captionPath = resolve(outDir, `${figId}-caption.md`);
    writeFileSync(captionPath, caption, 'utf-8');

    // 执行 Python 代码
    const execResult = this.executePython(finalCode, outDir);

    const result = {
      id: figId,
      pyPath,
      pdfPath: execResult.success ? outputPdf : null,
      pngPath: execResult.success ? outputPng : null,
      captionPath,
      caption,
      success: execResult.success || execResult.scriptOnly,
      error: execResult.error,
      scriptOnly: execResult.scriptOnly || false,
    };

    // 注册到图表注册表
    registry.register(figId, spec, result);

    return result;
  }

  executePython(code, outputDir) {
    const depCheck = ensurePythonDeps();
    if (!depCheck.available) {
      console.log(`  ⚠️ Python 环境检查: ${depCheck.error}。将仅生成 .py 脚本，跳过渲染。`);
      return { success: false, error: depCheck.error, scriptOnly: true };
    }

    const complexityScore = this._estimateComplexity(code);
    const timeout = complexityScore > 0.5 ? 120000 : 60000;

    const tmpPy = resolve(outputDir, `_tmp_exec_${Date.now()}.py`);
    writeFileSync(tmpPy, code, 'utf-8');

    try {
      const result = execSync(`"${_pythonCmd}" "${tmpPy}"`, {
        cwd: outputDir,
        timeout,
        stdio: 'pipe',
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
      });
      return { success: true, output: result.toString().trim() };
    } catch (err) {
      const stderr = err.stderr ? err.stderr.toString() : '';
      const stdout = err.stdout ? err.stdout.toString() : '';
      let errorMsg = stderr || err.message;

      // 尝试提取 Python 错误类型
      if (stderr.includes('ModuleNotFoundError')) {
        const moduleMatch = stderr.match(/ModuleNotFoundError: No module named '(\w+)'/);
        const moduleName = moduleMatch ? moduleMatch[1] : 'unknown';
        errorMsg = `缺少 Python 模块: ${moduleName}。请执行: pip install ${moduleName}`;
      } else if (stderr.includes('SyntaxError')) {
        errorMsg = `Python 语法错误。${stderr.slice(0, 200)}`;
      } else if (stderr.includes('MemoryError')) {
        errorMsg = 'Python 内存不足，请简化图表数据量';
      }

      return {
        success: false,
        error: errorMsg,
        stdout: stdout.slice(0, 500),
      };
    } finally {
      try {
        unlinkSync(tmpPy);
      } catch {}
    }
  }

  _estimateComplexity(code) {
    let score = 0;
    if (code.includes('heatmap') || code.includes('radar')) score += 0.3;
    if (code.includes('subplots') && (code.match(/subplots/g) || []).length > 1) score += 0.2;
    if ((code.match(/np\./g) || []).length > 10) score += 0.2;
    if ((code.match(/\\n/g) || []).length > 50) score += 0.2;
    if (code.includes('for ') || code.includes('while ')) score += 0.1;
    return Math.min(1, score);
  }

  generateFigureTable(figures) {
    if (!figures || figures.length === 0) return '';

    const lines = ['| 编号 | 标题 | 类型 | 文件 |', '|------|------|------|------|'];
    for (const fig of figures) {
      const num = fig.number || fig.index + 1;
      const title = fig.title || '';
      const type = fig.type || 'line';
      const file = fig.id ? `fig-${fig.id}.pdf` : '-';
      lines.push(`| 图${num} | ${title} | ${type} | ${file} |`);
    }
    return lines.join('\n');
  }
}

module.exports = {
  FigureGenerator,
  scanFigureAnnotations,
  parseFigureAnnotation,
  generatePythonCode,
  generateCaption,
  ACADEMIC_PALETTE,
};


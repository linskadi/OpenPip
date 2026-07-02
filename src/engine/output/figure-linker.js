const { readFileSync, writeFileSync } = require('fs');
const { resolve } = require('path');

// ============================================================
// FIGURE 标注正则
// <!-- FIGURE: 图1 准确率对比 数据: data/exp1.csv 类型: 柱状图 -->
// ============================================================

const FIGURE_ANNOTATION_REGEX = /<!--\s*FIGURE:\s*(.+?)\s*-->/g;

// ============================================================
// FigureLinker 主类
// ============================================================

class FigureLinker {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
  }

  scanFigureAnnotations(markdownContent) {
    const figures = [];
    let match;
    const regex = new RegExp(FIGURE_ANNOTATION_REGEX.source, 'g');

    while ((match = regex.exec(markdownContent)) !== null) {
      const parsed = this._parseAnnotation(match[1]);
      if (parsed) {
        parsed.annotationIndex = figures.length;
        parsed.startIndex = match.index;
        parsed.endIndex = match.index + match[0].length;
        figures.push(parsed);
      }
    }

    return figures;
  }

  _parseAnnotation(raw) {
    const parts = raw.trim().split(/\s+/);
    if (parts.length < 2) return null;

    const result = { raw: raw.trim() };
    let i = 0;

    // 解析图编号（如 "图1"）
    const numberMatch = parts[i].match(/^图(\d+)$/);
    if (numberMatch) {
      result.number = parseInt(numberMatch[1], 10);
      i++;
    }

    // 收集标题（直到遇到 key: value 对）
    const titleParts = [];
    while (i < parts.length && !parts[i].includes(':')) {
      titleParts.push(parts[i]);
      i++;
    }
    result.title = titleParts.join(' ');

    // 解析 key: value 对
    while (i < parts.length) {
      const segment = parts[i];
      const colonIdx = segment.indexOf(':');
      if (colonIdx > 0) {
        const key = segment.slice(0, colonIdx).toLowerCase();
        const value = segment.slice(colonIdx + 1);
        if (value) {
          result[key] = value;
        } else if (i + 1 < parts.length && !parts[i + 1].includes(':')) {
          result[key] = parts[++i];
        }
      }
      i++;
    }

    return result;
  }

  updateFigureNumbers(content, figures) {
    if (!figures || figures.length === 0) return content;

    let result = content;
    const replacements = [];

    figures.forEach((fig, idx) => {
      const newNumber = idx + 1;
      if (fig.number !== newNumber) {
        // 更新标注内的编号
        replacements.push({
          start: fig.startIndex,
          end: fig.endIndex,
          old: fig.raw,
          new: fig.raw.replace(`图${fig.number}`, `图${newNumber}`),
        });
      }
    });

    // 从后往前替换，避免索引偏移
    replacements.sort((a, b) => b.start - a.start);
    for (const r of replacements) {
      result = result.slice(0, r.start) + `<!-- FIGURE: ${r.new} -->` + result.slice(r.end);
    }

    return result;
  }

  syncReferences(content) {
    const figures = this.scanFigureAnnotations(content);
    if (figures.length === 0) return content;

    // 先更新编号
    let result = this.updateFigureNumbers(content, figures);

    // 重新扫描（编号已更新）
    const updatedFigures = this.scanFigureAnnotations(result);

    // 构建旧编号到新编号的映射
    const numberMap = {};
    updatedFigures.forEach((fig, idx) => {
      const originalNum = this._parseAnnotation(fig.raw)?.number;
      if (originalNum && originalNum !== idx + 1) {
        numberMap[originalNum] = idx + 1;
      }
    });

    // 如果没有编号变化，无需同步引用
    if (Object.keys(numberMap).length === 0) return result;

    for (const [oldNum, newNum] of Object.entries(numberMap)) {
      result = result
        .replace(
          new RegExp(`(如|见|参见|参考)\\s*图\\s*${oldNum}(\\s)`, 'g'),
          (_, p, s) => `${p}图${newNum}${s}`
        )
        .replace(
          new RegExp(`图\\s*${oldNum}\\s*(所示|可知|表明|可以看出|的结果)`, 'g'),
          (_, p) => `图${newNum}${p}`
        )
        .replace(
          new RegExp(`(Fig\\.?\\s*)${oldNum}(\\s)`, 'gi'),
          (_, p, s) => `${p}${newNum}${s}`
        );
    }

    return result;
  }

  generateFigureTable(figures) {
    if (!figures || figures.length === 0) return '';

    const lines = [];
    lines.push('| 编号 | 标题 | 类型 | 数据源 |');
    lines.push('|------|------|------|--------|');

    figures.forEach((fig, idx) => {
      const num = fig.number || idx + 1;
      const title = fig.title || '未命名';
      const type = fig.type || '未指定';
      const data = fig.data || '-';
      lines.push(`| 图${num} | ${title} | ${type} | ${data} |`);
    });

    return lines.join('\n');
  }

  findUnreferencedFigures(content) {
    const figures = this.scanFigureAnnotations(content);
    const unreferenced = [];

    for (const fig of figures) {
      const num = fig.number;
      if (!num) continue;

      // 检查正文中是否有引用该图编号
      const refPatterns = [
        new RegExp(`图\\s*${num}`, 'g'),
        new RegExp(`Fig\\.?\\s*${num}`, 'gi'),
      ];

      let found = false;
      for (const pattern of refPatterns) {
        // 排除标注本身
        const textWithoutAnnotations = content.replace(FIGURE_ANNOTATION_REGEX, '');
        if (pattern.test(textWithoutAnnotations)) {
          found = true;
          break;
        }
      }

      if (!found) {
        unreferenced.push(fig);
      }
    }

    return unreferenced;
  }

  validateFigures(content) {
    const figures = this.scanFigureAnnotations(content);
    const issues = [];

    // 检查编号连续性
    const numbers = figures.map(f => f.number).filter(Boolean).sort((a, b) => a - b);
    for (let i = 1; i < numbers.length; i++) {
      if (numbers[i] - numbers[i - 1] > 1) {
        issues.push({
          type: 'gap',
          message: `图表编号不连续：图${numbers[i - 1]} 后直接是图${numbers[i]}`,
        });
      }
    }

    // 检查重复编号
    const seen = new Set();
    for (const num of numbers) {
      if (seen.has(num)) {
        issues.push({
          type: 'duplicate',
          message: `图表编号重复：图${num}`,
        });
      }
      seen.add(num);
    }

    // 检查未引用的图表
    const unreferenced = this.findUnreferencedFigures(content);
    for (const fig of unreferenced) {
      issues.push({
        type: 'unreferenced',
        message: `图${fig.number} (${fig.title || '未命名'}) 在正文中未被引用`,
      });
    }

    // 检查缺少数据源
    for (const fig of figures) {
      if (!fig.data && !fig.type) {
        issues.push({
          type: 'incomplete',
          message: `图${fig.number || '?'} (${fig.title || '未命名'}) 缺少数据源或类型信息`,
        });
      }
    }

    return {
      figures,
      totalFigures: figures.length,
      issues,
      valid: issues.length === 0,
    };
  }

  batchUpdateReferences(dirPath) {
    const { readdirSync } = require('fs');
    const files = readdirSync(dirPath).filter(f => f.endsWith('.md'));
    const results = [];

    for (const file of files) {
      const filePath = resolve(dirPath, file);
      const content = readFileSync(filePath, 'utf-8');
      const updated = this.syncReferences(content);

      if (updated !== content) {
        writeFileSync(filePath, updated, 'utf-8');
        results.push({ file, updated: true });
      } else {
        results.push({ file, updated: false });
      }
    }

    return results;
  }
}

const _defaultLinker = new FigureLinker('');

module.exports = {
  FigureLinker,
  scanFigureAnnotations: (content) => _defaultLinker.scanFigureAnnotations(content),
  parseFigureAnnotation: (raw) => _defaultLinker._parseAnnotation(raw),
  updateFigureNumbers: (content, figures) => _defaultLinker.updateFigureNumbers(content, figures),
  syncReferences: (content) => _defaultLinker.syncReferences(content),
  generateFigureTable: (figures) => _defaultLinker.generateFigureTable(figures),
};

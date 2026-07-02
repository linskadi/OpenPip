'use strict';

const { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync, readdirSync } = require('fs');
const { resolve } = require('path');
const { execFileSync } = require('child_process');
const os = require('os');
const { parseMarkdownSectionsCore } = require('../utils');

const DOCUMENT_CLASSES = {
  journal: {
    class: 'ctexart',
    classOptions: ['UTF8', '10pt', 'a4paper'],
    packages: ['fontenc', 'cite', 'amsmath', 'amssymb', 'graphicx', 'booktabs', 'multirow', 'hyperref', 'geometry', 'adjustbox', 'caption'],
    options: ['10pt', 'a4paper'],
  },
  thesis: {
    class: 'ctexart',
    classOptions: ['UTF8', '12pt', 'a4paper'],
    packages: ['fontenc', 'amsmath', 'amssymb', 'graphicx', 'booktabs', 'hyperref', 'geometry', 'fancyhdr', 'adjustbox', 'caption'],
    options: ['12pt', 'a4paper'],
  },
  conference: {
    class: 'ctexart',
    classOptions: ['UTF8', 'conference'],
    packages: ['fontenc', 'cite', 'amsmath', 'amssymb', 'graphicx', 'booktabs', 'hyperref', 'adjustbox', 'caption'],
    options: ['conference'],
  },
  competition: {
    class: 'ctexart',
    classOptions: ['UTF8', '10pt', 'a4paper'],
    packages: ['fontenc', 'cite', 'amsmath', 'amssymb', 'graphicx', 'booktabs',
      'multirow', 'hyperref', 'geometry', 'adjustbox', 'caption',
      'algorithm2e', 'listings', 'siunitx', 'cleveref', 'enumitem',
      'subcaption', 'fancyhdr'],
    options: ['10pt', 'a4paper'],
    contest: {
      pageLimit: 25,
      titlePage: true,
      summarySheet: true,
      appendix: true,
    },
  },
};

let equationCounter = 0;

function parseMarkdownSections(content) {
  return parseMarkdownSectionsCore(content, {
    minLevel: 1,
    maxLevel: 3,
    stripNumber: true,
    includePreamble: true,
  });
}

function convertLatexMath(eq) {
  let result = eq;
  const symbols = [
    [/→/g, '\\rightarrow '], [/\u2192/g, '\\rightarrow '],
    [/←/g, '\\leftarrow '], [/\u2190/g, '\\leftarrow '],
    [/≤/g, '\\leq '], [/\u2264/g, '\\leq '],
    [/≥/g, '\\geq '], [/\u2265/g, '\\geq '],
    [/≠/g, '\\neq '], [/\u2260/g, '\\neq '],
    [/∈/g, '\\in '], [/\u2208/g, '\\in '],
    [/∉/g, '\\notin '], [/\u2209/g, '\\notin '],
    [/⊂/g, '\\subset '], [/\u2282/g, '\\subset '],
    [/∪/g, '\\cup '], [/\u222A/g, '\\cup '],
    [/∩/g, '\\cap '], [/\u2229/g, '\\cap '],
    [/∞/g, '\\infty '], [/\u221E/g, '\\infty '],
    [/∑/g, '\\sum '], [/\u2211/g, '\\sum '],
    [/∏/g, '\\prod '], [/\u220F/g, '\\prod '],
    [/∫/g, '\\int '], [/\u222B/g, '\\int '],
    [/√/g, '\\sqrt '], [/\u221A/g, '\\sqrt '],
    [/α/g, '\\alpha '], [/β/g, '\\beta '], [/γ/g, '\\gamma '],
    [/δ/g, '\\delta '], [/ε/g, '\\epsilon '], [/θ/g, '\\theta '],
    [/λ/g, '\\lambda '], [/μ/g, '\\mu '], [/π/g, '\\pi '],
    [/σ/g, '\\sigma '], [/τ/g, '\\tau '], [/φ/g, '\\phi '],
    [/ω/g, '\\omega '], [/Φ/g, '\\Phi '], [/Ψ/g, '\\Psi '], [/Ω/g, '\\Omega '],
  ];
  for (const [pat, rep] of symbols) {
    result = result.replace(pat, rep);
  }
  return result;
}

let tableCounter = 0;

function convertTables(text) {
  const tableRegex = /(\|.+\|)\n(\|[-:| ]+\|)\n((?:\|.+\|\n?)+)/g;

  return text.replace(tableRegex, (match, header, separator, rows) => {
    tableCounter++;
    const cols = header.split('|').filter(c => c.trim()).length;
    const colSpec = 'l'.repeat(cols);

    let latex = `\\begin{table}[htbp]\n\\centering\n\\resizebox{\\textwidth}{!}{\\begin{tabular}{${colSpec}}\n\\toprule\n`;

    const headers = header.split('|').filter(c => c.trim()).map(c => c.trim());
    latex += headers.join(' & ') + ' \\\\\n\\midrule\n';

    const dataRows = rows.trim().split('\n');
    for (const row of dataRows) {
      const cells = row.split('|').filter(c => c.trim()).map(c => c.trim());
      latex += cells.join(' & ') + ' \\\\\n';
    }

    latex += `\\bottomrule\n\\end{tabular}}\n\\caption{表${tableCounter}}\n\\label{tab:${tableCounter}}\n\\end{table}`;
    return latex;
  });
}

function markdownToLatex(text, projectName) {
  let result = text;
  const blockMath = [];

  // $$...$$ → equation or multline for long equations (auto-numbered)
  // Store as placeholders to protect from inline math conversion
  result = result.replace(/\$\$(.+?)\$\$/gs, (_, eq) => {
    const trimmed = eq.trim();
    const converted = convertLatexMath(trimmed);
    const lineCount = (converted.match(/\\\\/g) || []).length + 1;
    let block;
    if (lineCount > 1 || converted.length > 120) {
      equationCounter++;
      block = `\\begin{multline}\n${converted}\n\\label{eq:${equationCounter}}\n\\end{multline}`;
    } else {
      equationCounter++;
      block = `\\begin{equation}\n${converted}\n\\label{eq:${equationCounter}}\n\\end{equation}`;
    }
    blockMath.push(block);
    return `%%BLOCKMATH_${blockMath.length - 1}%%`;
  });

  // $...$ → inline math
  result = result.replace(/\$(.+?)\$/g, (_, eq) => `$${convertLatexMath(eq.trim())}$`);

  // Restore block math placeholders
  for (let i = 0; i < blockMath.length; i++) {
    result = result.replace(`%%BLOCKMATH_${i}%%`, blockMath[i]);
  }

  // [N] → \cite{N}
  result = result.replace(/\[(\d+(?:,\s*\d+)*)\]/g, '\\cite{$1}');

  // bold / italic
  result = result.replace(/\*\*(.+?)\*\*/g, '\\textbf{$1}');
  result = result.replace(/\*(.+?)\*/g, '\\textit{$1}');

  // tables
  result = convertTables(result);

  // figure placeholders: 支持 FIGURE 标注 → LaTeX figure 环境
  // 标注格式: <!-- FIGURE: 图N 标题 类型:xxx 数据:xxx -->
  // 查找对应 figId: 按编号匹配 figures/ 目录下的 .pdf/.png
  result = result.replace(/<!--\s*FIGURE:\s*(.+?)\s*-->/g, (_, desc) => {
    const label = desc.replace(/\s/g, '_').replace(/[：:]/g, '');
    const numMatch = desc.match(/图(\d+)/);
    const figNum = numMatch ? numMatch[1] : '1';

    const figuresDir = resolve(process.cwd(), 'papers', projectName || '', 'figures');
    let figPath = `figures/fig-${label}.pdf`;
    if (existsSync(figuresDir)) {
      try {
        const files = readdirSync(figuresDir);
        const pdfFile = files.find(f => f.endsWith('.pdf') && (f.includes(`图${figNum}`) || f.includes(`fig-${figNum}`)));
        if (pdfFile) figPath = `figures/${pdfFile}`;
      } catch {}
    }

    return `\\begin{figure}[htbp]\n\\centering\n\\adjustbox{max width=\\textwidth, max height=0.7\\textheight}{\\includegraphics{${figPath}}}\n\\caption{${desc}}\n\\label{fig:${label}}\n\\end{figure}`;
  });

  // lists
  result = result.replace(/^- (.+)$/gm, '\\item $1');
  result = result.replace(/^(\d+)\. (.+)$/gm, '\\item $2');

  // Markdown images: ![desc](path) → \includegraphics + figure environment
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, desc, imgPath) => {
    const label = desc.replace(/\s/g, '_').replace(/[：:]/g, '').slice(0, 30);
    // Normalize path: ensure figures/ prefix if relative
    let normalizedPath = imgPath;
    if (!imgPath.startsWith('http') && !imgPath.startsWith('/') && !imgPath.startsWith('figures/')) {
      normalizedPath = `figures/${imgPath}`;
    }
    return `\\begin{figure}[htbp]\n\\centering\n\\adjustbox{max width=\\textwidth, max height=0.7\\textheight}{\\includegraphics{${normalizedPath}}}\n\\caption{${desc}}\n\\label{fig:${label}}\n\\end{figure}`;
  });

  return result;
}

function generateTitlePage(options) {
  const title = options.title || '论文标题';
  const teamNumber = options.teamNumber || '';
  const school = options.school || '';
  const advisor = options.advisor || '';
  const members = options.members || '';
  const date = options.date || new Date().toLocaleDateString('zh-CN');

  let latex = '\\begin{titlepage}\n\\centering\n\\vspace*{2cm}\n';
  latex += `{\\Huge\\bfseries {${title}}}\n`;
  latex += '\\vspace{2cm}\n';
  if (teamNumber) latex += `{\\large 队号: ${teamNumber}}\\\\\n`;
  if (school) latex += `{\\large 学校: ${school}}\\\\\n`;
  if (advisor) latex += `{\\large 指导老师: ${advisor}}\\\\\n`;
  if (members) latex += `{\\large 队员: ${members}}\\\\\n`;
  latex += '\\vfill\n';
  latex += `{\\large ${date}}\n`;
  latex += '\\end{titlepage}\n\n';
  return latex;
}

function generateSummarySheet(options) {
  const title = options.title || '论文标题';
  const abstract = options.abstract || '';

  let latex = '\\newpage\n';
  latex += `\\begin{center}\n{\\Large\\bfseries ${title}}\n\\end{center}\n\n`;
  latex += '\\vspace{1em}\n';
  latex += `\\begin{abstract}\n${abstract}\n\\end{abstract}\n\n`;
  return latex;
}

function generateLatex(paperContent, options = {}) {
  const format = options.format || 'journal';
  const config = DOCUMENT_CLASSES[format] || DOCUMENT_CLASSES.journal;
  const title = options.title || '论文标题';
  const author = options.author || '';
  const abstract = options.abstract || '';

  const { sections } = parseMarkdownSections(paperContent);

  tableCounter = 0;
  equationCounter = 0;
  let latex = '';

  const classOpts = config.classOptions ? config.classOptions.join(',') : config.options.join(',');
  latex += `\\documentclass[${classOpts}]{${config.class}}\n\n`;

  for (const pkg of config.packages) {
    if (pkg === 'fontenc') {
      latex += '\\usepackage[T1]{fontenc}\n';
    } else if (pkg === 'caption') {
      latex += '\\usepackage[font=small,labelfont=bf]{caption}\n';
    } else {
      latex += `\\usepackage{${pkg}}\n`;
    }
  }
  latex += '\n';

  latex += '\\newcommand{\\vect}[1]{\\boldsymbol{#1}}\n';
  latex += '\\newcommand{\\mat}[1]{\\mathbf{#1}}\n';
  latex += '\n';

  const contest = config.contest || {};
  const titlePage = options.titlePage !== undefined ? options.titlePage : (contest.titlePage || false);
  const summarySheet = options.summarySheet !== undefined ? options.summarySheet : (contest.summarySheet || false);
  const appendixEnabled = options.appendix !== undefined ? options.appendix : (contest.appendix || false);

  latex += '\\begin{document}\n\n';

  if (titlePage) {
    latex += generateTitlePage(options);
  } else {
    latex += `\\title{${title}}\n`;
    if (author) latex += `\\author{${author}}\n`;
    latex += '\\maketitle\n\n';
  }

  if (summarySheet && abstract) {
    latex += generateSummarySheet(options);
  } else if (abstract) {
    latex += `\\begin{abstract}\n${abstract}\n\\end{abstract}\n\n`;
  }

  let mainSections = sections;
  let appendixSections = [];

  if (appendixEnabled) {
    const appendixIdx = sections.findIndex(s => s.title === '附录');
    if (appendixIdx !== -1) {
      appendixSections = sections.slice(appendixIdx + 1);
      mainSections = sections.slice(0, appendixIdx);
    }
  }

  for (const section of mainSections) {
    const indent = '  '.repeat(section.level - 1);
    const sectionCmd = ['section', 'subsection', 'subsubsection'][section.level - 1] || 'section';

    latex += `${indent}\\${sectionCmd}{${section.title}}\n\n`;

    const content = section.content.join('\n');
    latex += markdownToLatex(content, options.project) + '\n\n';
  }

  if (appendixEnabled && appendixSections.length > 0) {
    latex += '\\newpage\n\\appendix\n\n';
    for (const section of appendixSections) {
      const indent = '  '.repeat(section.level - 1);
      const sectionCmd = ['section', 'subsection', 'subsubsection'][section.level - 1] || 'section';

      latex += `${indent}\\${sectionCmd}{${section.title}}\n\n`;

      const content = section.content.join('\n');
      latex += markdownToLatex(content, options.project) + '\n\n';
    }
  }

  // Auto-insert figures at "图N" reference points in body text
  const figDir = resolve(process.cwd(), 'papers', options.project || '', 'figures');
  if (existsSync(figDir)) {
    const figFiles = readdirSync(figDir).filter(f => /\.(png|pdf)$/i.test(f)).sort();
    // Map figure numbers to files: fig01 → file, fig02 → file, etc.
    const figMap = {};
    for (const f of figFiles) {
      const numMatch = f.match(/fig(\d+)/i);
      if (numMatch) figMap[parseInt(numMatch[1])] = f;
    }

    // Insert figures after paragraphs mentioning "图N"
    for (let figNum = 1; figNum <= 20; figNum++) {
      const fileName = figMap[figNum];
      if (!fileName) continue;
      const figLabel = fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
      const figCmd = `\n\\begin{figure}[htbp]\n\\centering\n\\adjustbox{max width=\\textwidth, max height=0.7\\textheight}{\\includegraphics{figures/${fileName}}}\n\\caption{图${figNum}}\n\\label{fig:${figLabel}}\n\\end{figure}\n`;

      // Find the LAST occurrence of "图N" in the body (not appendix) before \appendix
      const appendixIdx = latex.indexOf('\\appendix');
      const searchRegion = appendixIdx > 0 ? latex.slice(0, appendixIdx) : latex;
      const figRefPattern = new RegExp(`图${figNum}[^\\d]`, 'g');
      let lastMatch = null;
      let match;
      while ((match = figRefPattern.exec(searchRegion)) !== null) {
        lastMatch = match;
      }

      if (lastMatch) {
        // Find the end of the paragraph (next blank line or \section)
        const afterRef = searchRegion.slice(lastMatch.index);
        const paraEnd = afterRef.search(/\n\n|\n\\(section|subsection)/);
        const insertPos = lastMatch.index + (paraEnd > 0 ? paraEnd : afterRef.length);
        // Only insert if not already present
        if (!latex.includes(`includegraphics{figures/${fileName}}`)) {
          latex = latex.slice(0, insertPos) + figCmd + latex.slice(insertPos);
        }
      }
    }
  }

  latex = scanAndInsertFigures(latex, figDir);

  latex += '\\end{document}\n';

  return latex;
}

function compilePdf(texPath, outputDir) {
  const tmpDir = resolve(os.tmpdir(), 'openpip-latex-' + Date.now());
  mkdirSync(tmpDir, { recursive: true });

  try {
    copyFileSync(texPath, resolve(tmpDir, 'paper.tex'));

    const run = () => {
      try {
        execFileSync('pdflatex', ['-interaction=nonstopmode', '-output-directory', tmpDir, resolve(tmpDir, 'paper.tex')], { timeout: 60000, stdio: 'pipe' });
      } catch (e) {
        // pdflatex returns non-zero on warnings, check if PDF was generated
      }
    };

    run();
    run();

    const pdfSrc = resolve(tmpDir, 'paper.pdf');
    if (existsSync(pdfSrc)) {
      const pdfDst = resolve(outputDir, 'paper.pdf');
      copyFileSync(pdfSrc, pdfDst);

      let pageCount = 0;
      try {
        const info = execFileSync('pdfinfo', [pdfSrc], { timeout: 10000, stdio: 'pipe', encoding: 'utf-8' });
        const match = info.match(/Pages:\s*(\d+)/);
        if (match) pageCount = parseInt(match[1], 10);
      } catch {
        // pdfinfo not available, try alternative
        try {
          const info = execFileSync('powershell', ['-Command', `(Get-Content '${pdfSrc.replace(/'/g, "''")}' -Encoding Byte | Select-String '/Count (\\d+)' -AllMatches).Matches.Value`], { timeout: 10000, stdio: 'pipe', encoding: 'utf-8' });
          const match = info.match(/(\d+)/);
          if (match) pageCount = parseInt(match[1], 10);
        } catch {
          // Could not determine page count
        }
      }

      return { success: true, pageCount };
    }
    return { success: false, error: 'PDF not generated' };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

function exportToLatex(paperPath, outputDir, options = {}) {
  const content = readFileSync(paperPath, 'utf-8');

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const pathParts = paperPath.split(/[\\/]/);
  const papersIdx = pathParts.lastIndexOf('papers');
  if (papersIdx >= 0 && papersIdx + 1 < pathParts.length) {
    options.project = pathParts[papersIdx + 1];
  }

  const latex = generateLatex(content, options);
  const texPath = resolve(outputDir, 'paper.tex');
  writeFileSync(texPath, latex, 'utf-8');

  let pdfResult = { success: false, error: 'pdflatex not available' };
  try {
    execFileSync('pdflatex', ['--version'], { timeout: 5000, stdio: 'pipe' });
    pdfResult = compilePdf(texPath, outputDir);
  } catch {
    // pdflatex not installed
  }

  const format = options.format || 'journal';
  const config = DOCUMENT_CLASSES[format] || DOCUMENT_CLASSES.journal;
  const contest = config.contest || {};
  const pageLimit = contest.pageLimit || 0;

  let pageWarning = null;
  if (pdfResult.success && pageLimit > 0 && pdfResult.pageCount > pageLimit) {
    pageWarning = `页数 ${pdfResult.pageCount} 超过限制 ${pageLimit} 页`;
  }

  return {
    texPath,
    pdfPath: pdfResult.success ? resolve(outputDir, 'paper.pdf') : null,
    success: pdfResult.success,
    error: pdfResult.error,
    pageCount: pdfResult.pageCount || 0,
    pageLimit,
    pageWarning,
  };
}

function scanAndInsertFigures(texContent, figuresDir) {
  if (!existsSync(figuresDir)) return texContent;

  const files = readdirSync(figuresDir).filter(f => /\.(png|pdf)$/i.test(f));
  const referenced = new Set();
  const figRefRegex = /\\includegraphics(?:\[.*?\])?\{([^}]+)\}/g;
  let m;
  while ((m = figRefRegex.exec(texContent)) !== null) {
    referenced.add(m[1].split('/').pop());
  }

  const orphanFiles = files.filter(f => !referenced.has(f));
  if (orphanFiles.length === 0) return texContent;

  const figuresLatex = orphanFiles.map((file, i) => {
    const label = file.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    return `\\begin{figure}[H]\n\\centering\n\\adjustbox{max width=\\textwidth, max height=0.7\\textheight}{\\includegraphics{figures/${file}}}\n\\caption{图${i + 1}: ${label}}\n\\label{fig:app_${label}}\n\\end{figure}`;
  }).join('\n\n');

  const insertPoint = texContent.lastIndexOf('\\end{document}');
  if (insertPoint === -1) return texContent;

  return texContent.slice(0, insertPoint)
    + '\\newpage\n\\section*{附录图表}\n\n' + figuresLatex + '\n\n'
    + texContent.slice(insertPoint);
}

function venueCheck(paperPath, venue) {
  if (!existsSync(paperPath)) return { valid: false, issues: ['论文文件不存在'] };
  const content = readFileSync(paperPath, 'utf-8');
  const issues = [];

  // 检查篇幅：将中文字符替换为 2 字节占位符后按空白拆分，近似统计词数
  const wordCount = content.replace(/[\u4e00-\u9fff]/g, 'cc').split(/\s+/).length;
  if (venue === 'neurips' && wordCount > 5000) issues.push(`篇幅超出 NeurIPS 限制（当前约 ${wordCount} 词，限制 8 页 ≈ 4000-5000 词）`);
  if (venue === 'icml' && wordCount > 5500) issues.push(`篇幅超出 ICML 限制（当前约 ${wordCount} 词）`);

  // 检查必要章节
  const requiredSections = {
    neurips: ['abstract', 'introduction', 'method', 'experiment', 'conclusion'],
    icml: ['abstract', 'introduction', 'method', 'experiment', 'conclusion'],
    acl: ['abstract', 'introduction', 'method', 'experiment', 'conclusion'],
    'ieee-tpami': ['abstract', 'introduction', 'method', 'experiment', 'conclusion'],
    'chinese-core': ['摘要', '引言', '方法', '实验', '结论'],
  };

  const sections = requiredSections[venue];
  if (sections) {
    for (const sec of sections) {
      const re = new RegExp(`#{1,3}\\s*${sec}`, 'i');
      if (!re.test(content)) issues.push(`缺少必要章节: ${sec}`);
    }
  }

  return { valid: issues.length === 0, issues };
}

module.exports = {
  exportToLatex,
  DOCUMENT_CLASSES,
  venueCheck,
};

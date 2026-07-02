const { resolve } = require('path');
const { existsSync } = require('fs');
const { execFileSync } = require('child_process');
const { findProjectDir } = require('../services/project-service');

module.exports = async function(args, engine, ROOT) {
  const project = args[1];
  const format = args[2] || 'docx';
  if (!project) { console.error('用法: openpip export <项目名> [docx|latex|md]'); return; }
  const projectDir = findProjectDir(ROOT, project);
  if (!projectDir) { console.error(`项目 '${project}' 不存在`); return; }
  const paperPath = resolve(projectDir, 'output', 'paper.md');
  if (!existsSync(paperPath)) { console.error('论文文件不存在，请先运行 openpip run'); return; }

  if (format === 'md') {
    console.log(`📄 已有 Markdown: ${paperPath}`);
  } else if (format === 'docx') {
    try {
      execFileSync('pandoc', [paperPath, '-o', resolve(projectDir, 'output', 'paper.docx'), '--from', 'markdown', '--to', 'docx'], { timeout: 30000 });
      console.log(`✅ 导出 DOCX: ${resolve(projectDir, 'output', 'paper.docx')}`);
    } catch {
      console.error('❌ 导出失败: 需要安装 pandoc (winget install pandoc)');
    }
  } else if (format === 'latex' || format === 'tex') {
    try {
      execFileSync('pandoc', [paperPath, '-o', resolve(projectDir, 'output', 'paper.tex'), '--from', 'markdown', '--to', 'latex', '--standalone', '--toc'], { timeout: 30000 });
      console.log(`✅ 导出 LaTeX: ${resolve(projectDir, 'output', 'paper.tex')}`);
    } catch {
      console.error('❌ 导出失败: 需要安装 pandoc (winget install pandoc)');
    }
  } else {
    console.error(`不支持的格式: ${format}。支持: md, docx, latex`);
  }
};

const { readFileSync, existsSync, readdirSync, statSync } = require('fs');
const { resolve } = require('path');

const SCAN_DIRS = ['user-input', 'data', 'references'];

const FILE_PRIORITY = {
  '.md': 10,
  '.txt': 9,
  '.csv': 8,
  '.xlsx': 7,
  '.xls': 7,
  '.json': 6,
  '.py': 5,
  '.m': 5,
  '.r': 4,
  '.pdf': 3,
  '.ipynb': 2,
};

function scanProjectFiles(projectDir, maxFiles = 10) {
  const files = [];

  for (const dirName of SCAN_DIRS) {
    const dirPath = resolve(projectDir, dirName);
    if (!existsSync(dirPath)) continue;

    try {
      for (const entry of readdirSync(dirPath)) {
        if (entry.startsWith('.') || entry === 'desktop.ini') continue;
        const fullPath = resolve(dirPath, entry);
        const stat = statSync(fullPath);
        if (!stat.isFile()) continue;

        const ext = entry.slice(entry.lastIndexOf('.')).toLowerCase();
        const priority = FILE_PRIORITY[ext] || 1;
        const sizeKB = Math.round(stat.size / 1024);

        const fileInfo = { path: `${dirName}/${entry}`, ext, sizeKB, priority };

        if (ext === '.csv' && stat.size < 102400) {
          const content = readFileSync(fullPath, 'utf-8').slice(0, 3000);
          const lines = content.split('\n').filter(l => l.trim());
          fileInfo.columns = lines[0] ? lines[0].split(',').map(c => c.trim()).filter(Boolean) : [];
          fileInfo.rows = Math.max(0, lines.length - 1);
          fileInfo.preview = lines.slice(0, 4).join('\n');
        } else if ((ext === '.md' || ext === '.txt') && stat.size < 51200) {
          const content = readFileSync(fullPath, 'utf-8');
          fileInfo.lines = content.split('\n').length;
          fileInfo.preview = content.split('\n').slice(0, 10).join('\n').slice(0, 1000);
        } else if (ext === '.json' && stat.size < 102400) {
          const content = readFileSync(fullPath, 'utf-8');
          try {
            const parsed = JSON.parse(content);
            fileInfo.keys = Array.isArray(parsed) ? `array[${parsed.length}]` : Object.keys(parsed).slice(0, 10);
          } catch {
            fileInfo.keys = '(unparseable)';
          }
        } else if (ext === '.py' || ext === '.m' || ext === '.r') {
          const content = readFileSync(fullPath, 'utf-8');
          const funcs = content.match(/def\s+\w+|function\s+\w+/g);
          fileInfo.functions = funcs ? funcs.slice(0, 10).map(f => f.replace(/def\s+|function\s+/, '')) : [];
        }

        files.push(fileInfo);
      }
    } catch {}
  }

  files.sort((a, b) => b.priority - a.priority);
  return files.slice(0, maxFiles);
}

function formatFilesContext(files) {
  if (files.length === 0) return '';

  const parts = ['\n## 项目目录下的数据文件\n'];
  for (const f of files) {
    parts.push(`- ${f.path} (${f.sizeKB} KB)`);
    if (f.columns && f.columns.length > 0) {
      parts.push(`  列: ${f.columns.join(', ')} (${f.rows} 行)`);
    }
    if (f.preview) {
      const previewLines = f.preview.split('\n').slice(0, 3);
      for (const line of previewLines) {
        parts.push(`  > ${line.slice(0, 60)}`);
      }
    }
    if (f.functions && f.functions.length > 0) {
      parts.push(`  函数: ${f.functions.join(', ')}`);
    }
    if (f.keys) {
      parts.push(`  结构: ${f.keys}`);
    }
    parts.push('');
  }
  return parts.join('\n');
}

module.exports = { scanProjectFiles, formatFilesContext, SCAN_DIRS };

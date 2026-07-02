const { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } = require('fs');
const { join, dirname } = require('path');
const crypto = require('crypto');
const { defaultLogger } = require('./infra/logger');

let yaml;
try {
  yaml = require('js-yaml');
} catch {}

// ── ID 生成 ──

function generateId(prefix = '') {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substr(2, 8);
  return prefix ? `${prefix}-${ts}-${rand}` : `${ts}-${rand}`;
}

// ── 文本相似度 ──

/**
 * 计算两段文本的 Jaccard 相似度
 * @param {string} text1 文本1
 * @param {string} text2 文本2
 * @param {'char'|'word'} unit 切分单元：char=字符（默认），word=单词
 */
function calculateSimilarity(text1, text2, unit = 'char') {
  if (!text1 || !text2) return 0;
  const tokens1 = new Set(unit === 'word' ? text1.split(/\s+/) : text1.split(''));
  const tokens2 = new Set(unit === 'word' ? text2.split(/\s+/) : text2.split(''));
  const intersection = new Set([...tokens1].filter(t => tokens2.has(t)));
  const union = new Set([...tokens1, ...tokens2]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

// ── 章节解析 ──

/**
 * 解析 Markdown 文本为章节结构（核心函数）
 * 统一支持 #/##/### 标题级别，供各模块按需适配
 * @param {string} content Markdown 文本
 * @param {Object} options 选项
 * @param {number} options.minLevel 最小标题级别（默认 1）
 * @param {number} options.maxLevel 最大标题级别（默认 3）
 * @param {boolean} options.stripNumber 是否去除标题编号（如 "1.2 引言" → "引言"）
 * @param {boolean} options.includePreamble 是否返回 preamble（标题前的内容）
 * @returns {{preamble?: string[], sections: Array<{title: string, level: number, content: string[]}>}}
 */
function parseMarkdownSectionsCore(content, options = {}) {
  const {
    minLevel = 1,
    maxLevel = 3,
    stripNumber = false,
    includePreamble = false,
  } = options;

  const sections = [];
  const preamble = [];
  const lines = content.split('\n');
  let current = null;

  for (const line of lines) {
    let matchedLevel = 0;
    let matchedTitle = '';
    for (let level = minLevel; level <= maxLevel; level++) {
      const m = line.match(new RegExp(`^${'#'.repeat(level)}\\s+(.+)`));
      if (m) {
        matchedLevel = level;
        matchedTitle = m[1];
        break;
      }
    }

    if (matchedLevel > 0) {
      if (current) sections.push(current);
      let title = matchedTitle.trim();
      if (stripNumber) {
        title = title.replace(/^\d+(?:\.\d+)*\s+/, '').trim();
      }
      current = { title, level: matchedLevel, content: [] };
    } else if (current) {
      current.content.push(line);
    } else if (includePreamble) {
      preamble.push(line);
    }
  }
  if (current) sections.push(current);

  return includePreamble ? { preamble, sections } : { sections };
}

/**
 * 简单章节解析（仅 ## 级别，返回字符串内容）
 * 保留用于 quality-check 等仅需二级标题的场景
 * @param {string} content Markdown 文本
 * @returns {Array<{title: string, content: string}>}
 */
function parseSections(content) {
  const { sections } = parseMarkdownSectionsCore(content, { minLevel: 2, maxLevel: 2 });
  return sections.map(s => ({
    title: s.title,
    content: s.content.length > 0 ? s.content.join('\n') + '\n' : '',
  }));
}

// ── LLM 响应 JSON 提取 ──

/**
 * 从文本中提取第一个 JSON 对象（常用于解析 LLM 响应）
 * @param {string} text 可能包含 JSON 的文本
 * @returns {Object|null} 解析后的对象，失败返回 null
 */
function extractJsonFromText(text) {
  if (!text) return null;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}
  return null;
}

// ── 目录遍历 ──

function walkDir(dir, callback) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath, callback);
    } else {
      callback(fullPath, entry, stat);
    }
  }
}

function collectFiles(dir) {
  const files = [];
  walkDir(dir, (fullPath, entry, stat) => {
    files.push({ path: fullPath, name: entry, size: stat.size, mtime: stat.mtime });
  });
  return files;
}

// ── JSON 文件 IO ──

function loadJsonFile(filePath, defaultValue = null) {
  if (existsSync(filePath)) {
    try {
      return JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch (err) {
      console.warn(`[utils] 无法解析 JSON: ${filePath} - ${err.message}`);
    }
  }
  return defaultValue;
}

function saveJsonFile(filePath, data) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ── YAML 文件 IO ──

function loadYaml(filePath, defaultValue = null) {
  if (!yaml) return defaultValue;
  if (existsSync(filePath)) {
    try {
      return yaml.load(readFileSync(filePath, 'utf-8'));
    } catch (err) {
      console.warn(`[utils] 无法解析 YAML: ${filePath} - ${err.message}`);
    }
  }
  return defaultValue;
}

function saveYaml(filePath, data) {
  if (!yaml) return false;
  try {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, yaml.dump(data), 'utf-8');
    return true;
  } catch (err) {
    console.error(`[utils] 写入 YAML 失败: ${filePath} - ${err.message}`);
    return false;
  }
}

// ── 文件读写 ──

function safeReadFile(filePath, encoding = 'utf-8') {
  try {
    return readFileSync(filePath, encoding);
  } catch (err) {
    console.warn(`[utils] 无法读取文件: ${filePath} - ${err.message}`);
    return null;
  }
}

function safeWriteFile(filePath, content) {
  try {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch (err) {
    defaultLogger.error({ tag: 'utils', message: `写入文件失败: ${filePath} - ${err.message}` });
    return false;
  }
}

// ── 哈希计算 ──

function calculateHash(content, algorithm = 'sha256') {
  return crypto.createHash(algorithm).update(content).digest('hex');
}

// ── 时间格式化 ──

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

// ── HTML 转义 ──

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── 去重检查 ──

function deduplicateBy(arr, keyFn) {
  const seen = new Set();
  return arr.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── 通用 walkDir 拷贝 ──

function copyDirSync(source, target) {
  if (!existsSync(target)) {
    mkdirSync(target, { recursive: true });
  }
  for (const entry of readdirSync(source)) {
    const srcPath = join(source, entry);
    const destPath = join(target, entry);
    const stat = statSync(srcPath);
    if (stat.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      const ext = entry.split('.').pop().toLowerCase();
      const textExts = ['md', 'txt', 'json', 'yaml', 'yml', 'js', 'py', 'r', 'm', 'tex', 'css', 'html', 'xml', 'csv', 'tsv'];
      if (textExts.includes(ext)) {
        writeFileSync(destPath, readFileSync(srcPath, 'utf-8'), 'utf-8');
      } else {
        writeFileSync(destPath, readFileSync(srcPath));
      }
    }
  }
}

// ── 深度合并（后者覆盖前者，嵌套对象递归） ──

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] === undefined) continue;
    if (
      typeof source[key] === 'object' &&
      source[key] !== null &&
      !Array.isArray(source[key]) &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

module.exports = {
  generateId,
  calculateSimilarity,
  parseMarkdownSectionsCore,
  parseSections,
  extractJsonFromText,
  walkDir,
  collectFiles,
  copyDirSync,
  loadJsonFile,
  saveJsonFile,
  loadYaml,
  saveYaml,
  safeReadFile,
  safeWriteFile,
  calculateHash,
  formatDuration,
  escapeHtml,
  deduplicateBy,
  deepMerge,
};

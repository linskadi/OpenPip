const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs');
const { resolve } = require('path');
const { parseBibTeX } = require('../literature/bibtex-parser');
const { formatGB7714 } = require('../literature/reference-formatter');
const { loadJsonFile } = require('../utils');

class CitationWhitelist {
  constructor(projectDir) {
    this.projectDir = projectDir;
    this.refsDir = resolve(projectDir, 'references');
    this.whitelistFile = resolve(this.refsDir, 'whitelist.json');
    this.entries = [];
    this._load();
  }

  _load() {
    this.entries = loadJsonFile(this.whitelistFile, []);
  }

  _save() {
    mkdirSync(this.refsDir, { recursive: true });
    writeFileSync(this.whitelistFile, JSON.stringify(this.entries, null, 2), 'utf-8');
  }

  importBibTeX(filePath) {
    if (!existsSync(filePath)) return { success: false, error: `文件不存在: ${filePath}` };
    const content = readFileSync(filePath, 'utf-8');
    const parsed = parseBibTeX(content);
    let added = 0;
    for (const entry of parsed) {
      const entryId = entry.key || entry.id;
      if (!this.entries.find(e => (e.key || e.id) === entryId)) {
        this.entries.push(entry);
        added++;
      }
    }
    this._save();
    return { success: true, added, total: this.entries.length };
  }

  importBibTeXContent(content) {
    const parsed = parseBibTeX(content);
    let added = 0;
    for (const entry of parsed) {
      const entryId = entry.key || entry.id;
      if (!this.entries.find(e => (e.key || e.id) === entryId)) {
        this.entries.push(entry);
        added++;
      }
    }
    this._save();
    return { success: true, added, total: this.entries.length };
  }

  addEntry(entry) {
    const entryId = entry.key || entry.id;
    if (!entryId) return { success: false, error: '条目缺少 key/id' };
    if (this.entries.find(e => (e.key || e.id) === entryId)) {
      return { success: false, error: `条目 ${entryId} 已存在` };
    }
    this.entries.push(entry);
    this._save();
    return { success: true, total: this.entries.length };
  }

  removeEntry(id) {
    const idx = this.entries.findIndex(e => (e.key || e.id) === id);
    if (idx === -1) return { success: false, error: `条目 ${id} 不存在` };
    this.entries.splice(idx, 1);
    this._save();
    return { success: true, total: this.entries.length };
  }

  getEntry(id) {
    return this.entries.find(e => (e.key || e.id) === id) || null;
  }

  getAll() {
    return this.entries;
  }

  formatAsNumbered() {
    return this.entries.map((e, i) => {
      const formatted = formatGB7714(e);
      return `[${i + 1}] ${formatted}`;
    });
  }

  formatForPrompt() {
    if (this.entries.length === 0) return '';
    const lines = this.entries.map((e, i) => {
      const authors = e.authors ? e.authors.map(a => a.name || a).join(', ') : 'Unknown';
      const year = e.year || 'n.d.';
      const title = e.title || 'Untitled';
      const journal = e.journal || e.booktitle || '';
      return `[${i + 1}] ${authors}. ${title}. ${journal ? journal + ', ' : ''}${year}.`;
    });
    return `可用参考文献库（只能引用以下文献，不得编造）：\n${lines.join('\n')}`;
  }

  verifyCitation(text) {
    const citationPattern = /\[(\d+)\]/g;
    const referenced = new Set();
    let match;
    while ((match = citationPattern.exec(text)) !== null) {
      referenced.add(parseInt(match[1]));
    }

    const issues = [];
    for (const num of referenced) {
      if (num < 1 || num > this.entries.length) {
        issues.push({ type: 'out_of_range', citation: num, message: `引用 [${num}] 超出文献库范围（共 ${this.entries.length} 篇）` });
      }
    }

    return { valid: issues.length === 0, issues, totalCitations: referenced.size, librarySize: this.entries.length };
  }
}

module.exports = { CitationWhitelist };

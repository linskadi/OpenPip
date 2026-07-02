const { resolve } = require('path');
const { writeFileSync, mkdirSync } = require('fs');
const { loadJsonFile } = require('../../engine/utils');

class ChatSession {
  constructor(root) {
    this.root = root;
    this.sessionFile = resolve(root, '.openpip', 'chat-session.json');
    this.state = this._load();
  }

  _load() {
    return loadJsonFile(this.sessionFile, {
      activeProject: null,
      importedFiles: [],
      history: [],
      createdAt: new Date().toISOString(),
    });
  }

  _save() {
    const dir = resolve(this.root, '.openpip');
    mkdirSync(dir, { recursive: true });
    writeFileSync(this.sessionFile, JSON.stringify(this.state, null, 2), 'utf-8');
  }

  get activeProject() {
    return this.state.activeProject;
  }

  setActiveProject(name) {
    this.state.activeProject = name;
    this._save();
  }

  addImportedFile(file) {
    if (!this.state.importedFiles.includes(file)) {
      this.state.importedFiles.push(file);
      this._save();
    }
  }

  getContextMenu() {
    const parts = [];
    if (this.state.activeProject) {
      parts.push(`当前项目: ${this.state.activeProject}`);
    } else {
      parts.push('当前项目: 未选择');
    }
    if (this.state.importedFiles.length > 0) {
      parts.push(`已导入文件: ${this.state.importedFiles.join(', ')}`);
    }
    return parts.join('\n');
  }

  clear() {
    this.state = {
      activeProject: null,
      importedFiles: [],
      history: [],
      createdAt: new Date().toISOString(),
    };
    this._save();
  }
}

module.exports = { ChatSession };

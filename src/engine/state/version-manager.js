const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs');
const { resolve, dirname } = require('path');
const { loadJsonFile, calculateHash } = require('../utils');

// 版本管理器
class VersionManager {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.versionsDir = resolve(projectRoot, 'papers', 'versions');
    this.indexFile = resolve(this.versionsDir, 'index.json');
    this.index = this.loadIndex();
  }

  loadIndex() {
    return loadJsonFile(this.indexFile, { versions: [], current: null });
  }

  saveIndex() {
    if (!existsSync(this.versionsDir)) {
      mkdirSync(this.versionsDir, { recursive: true });
    }
    writeFileSync(this.indexFile, JSON.stringify(this.index, null, 2), 'utf-8');
  }

  // 创建版本快照
  createSnapshot(files, description = '', metadata = {}) {
    const versionId = `v${this.index.versions.length + 1}-${Date.now()}`;
    const snapshotDir = resolve(this.versionsDir, versionId);

    if (!existsSync(snapshotDir)) {
      mkdirSync(snapshotDir, { recursive: true });
    }

    const snapshotFiles = [];
    for (const file of files) {
      const content = readFileSync(file.path, 'utf-8');
      const hash = calculateHash(content);
      const relativePath = file.path.replace(this.projectRoot, '').replace(/\\/g, '/');

      // 保存文件内容
      const snapshotFilePath = resolve(snapshotDir, relativePath.replace(/[/\\]/g, '_'));
      writeFileSync(snapshotFilePath, content, 'utf-8');

      snapshotFiles.push({
        originalPath: relativePath,
        snapshotPath: snapshotFilePath,
        hash,
        size: content.length,
        modified: new Date().toISOString(),
      });
    }

    const version = {
      id: versionId,
      description,
      timestamp: new Date().toISOString(),
      files: snapshotFiles,
      metadata,
    };

    this.index.versions.push(version);
    this.index.current = versionId;
    this.saveIndex();

    return version;
  }

  // 回退到指定版本
  revertTo(versionId) {
    const version = this.index.versions.find(v => v.id === versionId);
    if (!version) {
      console.error(`❌ 版本不存在: ${versionId}`);
      return false;
    }

    const restored = [];
    for (const file of version.files) {
      const snapshotContent = readFileSync(file.snapshotPath, 'utf-8');
      const originalPath = resolve(this.projectRoot, file.originalPath.substring(1));

      // 确保目录存在
      const dir = dirname(originalPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(originalPath, snapshotContent, 'utf-8');
      restored.push(file.originalPath);
    }

    this.index.current = versionId;
    this.saveIndex();

    console.log(`  ✅ 已回退 ${restored.length} 个文件到版本: ${versionId}`);
    return restored;
  }

  // 对比两个版本
  diff(versionId1, versionId2) {
    const v1 = this.index.versions.find(v => v.id === versionId1);
    const v2 = this.index.versions.find(v => v.id === versionId2);

    if (!v1 || !v2) {
      return { error: '版本不存在' };
    }

    const files1 = new Map(v1.files.map(f => [f.originalPath, f]));
    const files2 = new Map(v2.files.map(f => [f.originalPath, f]));

    const added = [];
    const removed = [];
    const modified = [];

    for (const [path, file] of files2) {
      if (!files1.has(path)) {
        added.push({ path, ...file });
      } else if (files1.get(path).hash !== file.hash) {
        modified.push({
          path,
          from: files1.get(path),
          to: file,
        });
      }
    }

    for (const [path] of files1) {
      if (!files2.has(path)) {
        removed.push({ path });
      }
    }

    return { added, removed, modified };
  }

  // 生成版本说明
  generateVersionNotes(versionId) {
    const version = this.index.versions.find(v => v.id === versionId);
    if (!version) return null;

    let notes = `# 版本 ${versionId}\n\n`;
    notes += `**创建时间**: ${version.timestamp}\n`;
    notes += `**说明**: ${version.description || '无'}\n\n`;
    notes += '## 文件列表\n\n';
    notes += '| 文件 | 大小 | 哈希 |\n';
    notes += '|------|------|------|\n';

    for (const file of version.files) {
      notes += `| ${file.originalPath} | ${file.size} B | ${file.hash.substring(0, 12)}... |\n`;
    }

    if (Object.keys(version.metadata).length > 0) {
      notes += '\n## 元数据\n\n';
      notes += '```json\n';
      notes += JSON.stringify(version.metadata, null, 2);
      notes += '\n```\n';
    }

    return notes;
  }

  // 获取版本列表
  listVersions(limit = 20) {
    return this.index.versions.slice(-limit).reverse();
  }

  // 获取当前版本
  getCurrentVersion() {
    return this.index.current;
  }

  // 自动快照（用于流水线每阶段完成时）
  autoSnapshot(pipelineId, stageId, files) {
    return this.createSnapshot(
      files,
      `流水线 ${pipelineId} 阶段 ${stageId} 完成`,
      { pipelineId, stageId, auto: true }
    );
  }
}

module.exports = { VersionManager };

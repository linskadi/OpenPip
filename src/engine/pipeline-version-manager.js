const { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } = require('fs');
const { join, basename } = require('path');
const { calculateHash, loadJsonFile, saveJsonFile } = require('./utils');

class PipelineVersionManager {
  constructor(pipelinesDir) {
    this.dir = pipelinesDir;
    this.versionsDir = join(pipelinesDir, '.versions');
  }

  saveVersion(pipelineName, description = '') {
    const srcFile = join(this.dir, `${pipelineName}.yaml`);
    if (!existsSync(srcFile)) {
      throw new Error(`Pipeline file not found: ${pipelineName}.yaml`);
    }

    const content = readFileSync(srcFile, 'utf-8');
    const hash = calculateHash(content);
    const shortHash = hash.substring(0, 8);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    const pipelineDir = join(this.versionsDir, pipelineName);
    if (!existsSync(pipelineDir)) {
      mkdirSync(pipelineDir, { recursive: true });
    }

    const versionFile = join(pipelineDir, `${shortHash}-${timestamp}.yaml`);
    writeFileSync(versionFile, content, 'utf-8');

    const indexFile = join(pipelineDir, 'index.json');
    const index = loadJsonFile(indexFile, []);
    index.push({ hash, timestamp: new Date().toISOString(), description });
    saveJsonFile(indexFile, index);

    return { hash, shortHash, versionFile, description };
  }

  listVersions(pipelineName) {
    const indexFile = join(this.versionsDir, pipelineName, 'index.json');
    return loadJsonFile(indexFile, []);
  }

  rollback(pipelineName, versionHash) {
    const index = this.listVersions(pipelineName);
    const entry = index.find(v => v.hash === versionHash);
    if (!entry) {
      throw new Error(`Version ${versionHash} not found for pipeline ${pipelineName}`);
    }

    const pipelineDir = join(this.versionsDir, pipelineName);
    const versionFiles = readdirSync(pipelineDir).filter(f =>
      f.startsWith(versionHash.substring(0, 8)) && f.endsWith('.yaml')
    );
    if (versionFiles.length === 0) {
      throw new Error(`Version file not found for hash ${versionHash}`);
    }

    const versionContent = readFileSync(join(pipelineDir, versionFiles[0]), 'utf-8');
    const destFile = join(this.dir, `${pipelineName}.yaml`);
    writeFileSync(destFile, versionContent, 'utf-8');

    return { restored: destFile, hash: versionHash };
  }

  diff(pipelineName, hash1, hash2) {
    const content1 = this._readVersionContent(pipelineName, hash1);
    const content2 = this._readVersionContent(pipelineName, hash2);

    const lines1 = content1.split('\n');
    const lines2 = content2.split('\n');

    const added = [];
    const removed = [];
    const modified = [];

    const maxLen = Math.max(lines1.length, lines2.length);
    for (let i = 0; i < maxLen; i++) {
      const line1 = lines1[i];
      const line2 = lines2[i];

      if (line1 === undefined) {
        added.push({ line: i + 1, content: line2 });
      } else if (line2 === undefined) {
        removed.push({ line: i + 1, content: line1 });
      } else if (line1 !== line2) {
        modified.push({ line: i + 1, from: line1, to: line2 });
      }
    }

    return { added, removed, modified };
  }

  _readVersionContent(pipelineName, hash) {
    const index = this.listVersions(pipelineName);
    const entry = index.find(v => v.hash === hash);
    if (!entry) {
      throw new Error(`Version ${hash} not found for pipeline ${pipelineName}`);
    }

    const pipelineDir = join(this.versionsDir, pipelineName);
    const shortHash = hash.substring(0, 8);
    const files = readdirSync(pipelineDir).filter(f =>
      f.startsWith(shortHash) && f.endsWith('.yaml')
    );
    if (files.length === 0) {
      throw new Error(`Version file not found for hash ${hash}`);
    }

    return readFileSync(join(pipelineDir, files[0]), 'utf-8');
  }
}

function getPipelineVersionManager(pipelinesDir) {
  return new PipelineVersionManager(pipelinesDir);
}

module.exports = { PipelineVersionManager, getPipelineVersionManager };

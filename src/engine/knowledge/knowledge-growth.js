const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs');
const { resolve } = require('path');
const { generateId, loadJsonFile, copyDirSync, walkDir } = require('../utils');

// 知识候选池
class KnowledgeCandidatePool {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.poolFile = resolve(projectRoot, 'papers', 'knowledge-candidates.json');
    this.candidates = this.loadPool();
  }

  loadPool() {
    return loadJsonFile(this.poolFile, { terms: [], corrections: [], errors: [], version: '1.0' });
  }

  savePool() {
    const dir = resolve(this.projectRoot, 'papers');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.poolFile, JSON.stringify(this.candidates, null, 2), 'utf-8');
  }

  // 添加新术语候选
  addTerm(term, definition, source, confidence = 0.8) {
    const candidate = {
      id: generateId('term'),
      term,
      definition,
      source,
      confidence,
      status: 'pending',
      votes: 0,
      addedAt: new Date().toISOString(),
      reviewedAt: null,
      reviewedBy: null,
    };

    // 检查是否已存在
    const exists = this.candidates.terms.some(
      t => t.term === term && t.status === 'pending'
    );

    if (!exists) {
      this.candidates.terms.push(candidate);
      this.savePool();
    }

    return candidate;
  }

  // 添加修正候选
  addCorrection(original, corrected, reason, source) {
    const candidate = {
      id: generateId('corr'),
      original,
      corrected,
      reason,
      source,
      status: 'pending',
      addedAt: new Date().toISOString(),
    };

    this.candidates.corrections.push(candidate);
    this.savePool();
    return candidate;
  }

  // 添加负面知识（踩坑案例）
  addError(error, context, solution, source) {
    const candidate = {
      id: generateId('err'),
      error,
      context,
      solution,
      source,
      severity: 'medium',
      addedAt: new Date().toISOString(),
    };

    this.candidates.errors.push(candidate);
    this.savePool();
    return candidate;
  }

  // 从审稿反馈中提取常见问题
  ingestReviewFeedback(feedbackItems) {
    const frequency = {};
    for (const item of feedbackItems) {
      const key = `${item.category}:${item.text.slice(0, 50)}`;
      if (!frequency[key]) frequency[key] = { item, count: 0 };
      frequency[key].count++;
    }

    for (const { item, count } of Object.values(frequency)) {
      if (count >= 3) {
        this.addError(
          item.text.slice(0, 200),
          `审稿反馈 (频次: ${count})`,
          '待补充',
          'review-feedback'
        );
      }
    }
  }

  // 获取待审核候选
  getPending(type = 'all') {
    const result = {};
    if (type === 'all' || type === 'terms') {
      result.terms = this.candidates.terms.filter(t => t.status === 'pending');
    }
    if (type === 'all' || type === 'corrections') {
      result.corrections = this.candidates.corrections.filter(c => c.status === 'pending');
    }
    if (type === 'all' || type === 'errors') {
      result.errors = this.candidates.errors.filter(e => !e.reviewed);
    }
    return result;
  }

  // 获取已批准的候选
  getApproved(type = 'all') {
    const result = {};
    if (type === 'all' || type === 'terms') {
      result.terms = this.candidates.terms.filter(t => t.status === 'approved');
    }
    if (type === 'all' || type === 'corrections') {
      result.corrections = this.candidates.corrections.filter(c => c.status === 'approved');
    }
    return result;
  }

  // 投票支持
  vote(candidateId) {
    for (const term of this.candidates.terms) {
      if (term.id === candidateId) {
        term.votes++;
        this.savePool();
        return term;
      }
    }
    return null;
  }

  // 审核通过
  approve(candidateId, reviewer = 'user') {
    const allCandidates = [
      ...this.candidates.terms,
      ...this.candidates.corrections,
    ];

    for (const candidate of allCandidates) {
      if (candidate.id === candidateId) {
        candidate.status = 'approved';
        candidate.reviewedAt = new Date().toISOString();
        candidate.reviewedBy = reviewer;
        this.savePool();
        return candidate;
      }
    }
    return null;
  }

  // 审核拒绝
  reject(candidateId, reviewer = 'user', reason = '') {
    const allCandidates = [
      ...this.candidates.terms,
      ...this.candidates.corrections,
    ];

    for (const candidate of allCandidates) {
      if (candidate.id === candidateId) {
        candidate.status = 'rejected';
        candidate.reviewedAt = new Date().toISOString();
        candidate.reviewedBy = reviewer;
        candidate.rejectReason = reason;
        this.savePool();
        return candidate;
      }
    }
    return null;
  }

  // 获取统计信息
  getStats() {
    return {
      terms: {
        total: this.candidates.terms.length,
        pending: this.candidates.terms.filter(t => t.status === 'pending').length,
        approved: this.candidates.terms.filter(t => t.status === 'approved').length,
        rejected: this.candidates.terms.filter(t => t.status === 'rejected').length,
      },
      corrections: {
        total: this.candidates.corrections.length,
        pending: this.candidates.corrections.filter(c => c.status === 'pending').length,
      },
      errors: {
        total: this.candidates.errors.length,
      },
    };
  }
}

// 知识版本管理
class KnowledgeVersionManager {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.versionsDir = resolve(projectRoot, 'papers', 'knowledge-versions');
    this.versions = this.loadVersions();
  }

  loadVersions() {
    const indexFile = resolve(this.versionsDir, 'index.json');
    return loadJsonFile(indexFile, { versions: [], current: null });
  }

  saveVersions() {
    if (!existsSync(this.versionsDir)) {
      mkdirSync(this.versionsDir, { recursive: true });
    }
    const indexFile = resolve(this.versionsDir, 'index.json');
    writeFileSync(indexFile, JSON.stringify(this.versions, null, 2), 'utf-8');
  }

  // 创建版本快照
  createSnapshot(knowledgeDir, description = '') {
    const versionId = `v${this.versions.versions.length + 1}-${Date.now()}`;
    const snapshotDir = resolve(this.versionsDir, versionId);

    if (!existsSync(snapshotDir)) {
      mkdirSync(snapshotDir, { recursive: true });
    }

    // 复制知识文件
    const files = this.copyKnowledgeFiles(knowledgeDir, snapshotDir);

    const version = {
      id: versionId,
      description,
      timestamp: new Date().toISOString(),
      files: files.map(f => f.relativePath),
      size: files.reduce((sum, f) => sum + f.size, 0),
    };

    this.versions.versions.push(version);
    this.versions.current = versionId;
    this.saveVersions();

    return version;
  }

  // 复制知识文件
  copyKnowledgeFiles(sourceDir, targetDir) {
    copyDirSync(sourceDir, targetDir);
    // Collect file metadata from the copied target
    const files = [];
    walkDir(targetDir, (fullPath, entry, stat) => {
      const relativePath = fullPath.replace(targetDir, '').replace(/\\/g, '/').replace(/^\//, '');
      files.push({ relativePath, size: stat.size });
    });
    return files;
  }

  // 回退到指定版本
  revertTo(versionId, knowledgeDir) {
    const version = this.versions.versions.find(v => v.id === versionId);
    if (!version) {
      console.error(`❌ 版本不存在: ${versionId}`);
      return false;
    }

    const snapshotDir = resolve(this.versionsDir, versionId);
    if (!existsSync(snapshotDir)) {
      console.error(`❌ 版本快照目录不存在: ${snapshotDir}`);
      return false;
    }

    // 恢复文件
    this.restoreFiles(snapshotDir, knowledgeDir);

    this.versions.current = versionId;
    this.saveVersions();

    console.log(`  ✅ 已回退到版本: ${versionId}`);
    return true;
  }

  // 恢复文件
  restoreFiles(sourceDir, targetDir) {
    copyDirSync(sourceDir, targetDir);
  }

  // 对比两个版本
  diff(versionId1, versionId2) {
    const v1 = this.versions.versions.find(v => v.id === versionId1);
    const v2 = this.versions.versions.find(v => v.id === versionId2);

    if (!v1 || !v2) {
      return { error: '版本不存在' };
    }

    const files1 = new Set(v1.files);
    const files2 = new Set(v2.files);

    return {
      added: [...files2].filter(f => !files1.has(f)),
      removed: [...files1].filter(f => !files2.has(f)),
      common: [...files1].filter(f => files2.has(f)),
    };
  }

  // 获取版本列表
  listVersions(limit = 20) {
    return this.versions.versions.slice(-limit).reverse();
  }

  // 获取当前版本
  getCurrentVersion() {
    return this.versions.current;
  }
}

// 知识自生长管理器
class KnowledgeGrowthManager {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.candidatePool = new KnowledgeCandidatePool(projectRoot);
    this.versionManager = new KnowledgeVersionManager(projectRoot);
    this.knowledgeDir = resolve(projectRoot, '.openpip', 'knowledge');
  }

  // Agent 执行中收集新术语
  collectFromAgent(agentName, output, _task) {
    const candidates = [];

    // 提取可能的术语：通过正则匹配"新概念/定义/简称"等模式识别候选术语
    const termPatterns = [
      /(?:新(?:的)?|提出的?|引入的?)\s*["「]([^」"]+)["」]\s*(?:概念|方法|算法|模型|技术)/g,
      /(?:定义|称为|命名为)\s*["「]([^」"]+)["」]/g,
      /(?:简称为|缩写为)\s*["「]([^」"]+)["」]/g,
    ];

    for (const pattern of termPatterns) {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        const term = match[1].trim();
        if (term.length >= 2 && term.length <= 50) {
          candidates.push(
            this.candidatePool.addTerm(
              term,
              `来自 ${agentName} 的任务输出`,
              agentName,
              0.7
            )
          );
        }
      }
    }

    return candidates;
  }

  // 批量审核候选
  batchReview(candidates, action, reviewer = 'user') {
    const results = [];
    for (const candidate of candidates) {
      if (action === 'approve') {
        results.push(this.candidatePool.approve(candidate.id, reviewer));
      } else if (action === 'reject') {
        results.push(this.candidatePool.reject(candidate.id, reviewer));
      }
    }
    return results;
  }

  // 合并已批准的术语到知识库
  mergeApprovedTerms() {
    const approvedResult = this.candidatePool.getApproved('terms');
    const approved = approvedResult.terms || [];

    if (approved.length === 0) {
      console.log('  ℹ️ 没有待合并的术语');
      return null;
    }

    // 创建版本快照
    this.versionManager.createSnapshot(this.knowledgeDir, '合并术语前快照');

    // 生成术语追加内容
    let appendContent = '\n\n## 自动收集的术语\n\n';
    for (const term of approved) {
      appendContent += `- **${term.term}**: ${term.definition} (来源: ${term.source})\n`;
    }

    // 追加到术语表
    const termsFile = resolve(this.knowledgeDir, 'terminology.md');
    if (existsSync(termsFile)) {
      const existing = readFileSync(termsFile, 'utf-8');
      writeFileSync(termsFile, existing + appendContent, 'utf-8');
    } else {
      writeFileSync(termsFile, '# 术语表\n' + appendContent, 'utf-8');
    }

    console.log(`  ✅ 已合并 ${approved.length} 个术语到知识库`);

    // 创建合并后快照
    this.versionManager.createSnapshot(this.knowledgeDir, `合并 ${approved.length} 个术语`);

    return approved;
  }

  // 获取状态报告
  getStatus() {
    return {
      candidates: this.candidatePool.getStats(),
      versions: {
        total: this.versionManager.versions.versions.length,
        current: this.versionManager.getCurrentVersion(),
      },
    };
  }
}

module.exports = {
  KnowledgeCandidatePool,
  KnowledgeVersionManager,
  KnowledgeGrowthManager,
};


const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs');
const { resolve, join, relative } = require('path');
const crypto = require('crypto');
const { walkDir, collectFiles, loadJsonFile } = require('../utils');

class TFIDF {
  constructor() {
    this.documents = [];
    this.vocab = new Map();
    this.idf = new Map();
  }

  tokenize(text) {
    const cleaned = text.toLowerCase().replace(/[，。、；：！？【】（）《》""「」『』·…—\-\s]+/g, ' ');
    const tokens = cleaned.split(' ').filter(t => t.length > 0);

    const result = [];
    for (const token of tokens) {
      if (/[\u4e00-\u9fff]/.test(token)) {
        result.push(token);
        if (token.length >= 4) {
          result.push(token.slice(0, 2));
        }
        if (token.length >= 6) {
          result.push(token.slice(0, 3));
        }
      } else {
        if (token.length > 1) result.push(token);
      }
    }
    return result;
  }

  addDocument(id, text, metadata = {}) {
    const tokens = this.tokenize(text);
    const tf = new Map();

    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
      this.vocab.set(token, (this.vocab.get(token) || 0) + 1);
    }

    this.documents.push({ id, text, tokens, tf, metadata });
  }

  computeIDF() {
    const N = this.documents.length;
    for (const [term, df] of this.vocab) {
      this.idf.set(term, Math.log(1 + N / (1 + df)));
    }
  }

  getTFIDF(tokens) {
    const tf = new Map();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }

    const vector = new Map();
    for (const [term, termFreq] of tf) {
      const idf = this.idf.get(term) || 0;
      vector.set(term, termFreq * idf);
    }
    return vector;
  }

  cosineSimilarity(vec1, vec2) {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (const [term, value] of vec1) {
      if (vec2.has(term)) {
        dotProduct += value * vec2.get(term);
      }
      norm1 += value * value;
    }

    for (const [, value] of vec2) {
      norm2 += value * value;
    }

    if (norm1 === 0 || norm2 === 0) return 0;
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  search(query, topK = 5) {
    const queryTokens = this.tokenize(query);
    const queryVector = this.getTFIDF(queryTokens);

    const results = this.documents.map(doc => ({
      id: doc.id,
      text: doc.text,
      metadata: doc.metadata,
      score: this.cosineSimilarity(queryVector, this.getTFIDF(doc.tokens)),
    }));

    return results.sort((a, b) => b.score - a.score).slice(0, topK);
  }
}

// ============================================================
// EmbeddingIndex：向量检索层（通过 Python 子进程调用 BGE-M3）
// ============================================================

class EmbeddingIndex {
  constructor() {
    this.embeddings = new Map(); // docId -> Float64Array
    this.dim = 0;
    this._available = false;
    this._checkPython();
  }

  _checkPython() {
    try {
      const { execFileSync } = require('child_process');
      for (const cmd of ['python3', 'python', 'py']) {
        try {
          const r = execFileSync(cmd, ['-c', 'import numpy; print("ok")'], { timeout: 5000, stdio: 'pipe' });
          if (r.toString().includes('ok')) {
            this._pythonCmd = cmd;
            this._available = true;
            break;
          }
        } catch {}
      }
    } catch {
      this._available = false;
    }
  }

  get available() { return this._available; }

  _callPython(script) {
    if (!this._available) return null;
    try {
      const { execFileSync } = require('child_process');
      const tmpFile = join(require('os').tmpdir(), `openpip_emb_${Date.now()}.py`);
      writeFileSync(tmpFile, script, 'utf-8');
      const result = execFileSync(this._pythonCmd, [tmpFile], { timeout: 30000, stdio: 'pipe', maxBuffer: 50 * 1024 * 1024 });
      try { require('fs').unlinkSync(tmpFile); } catch {}
      return JSON.parse(result.toString());
    } catch {
      return null;
    }
  }

  computeEmbedding(texts) {
    if (!this._available || texts.length === 0) return null;
    const dataFile = join(require('os').tmpdir(), `openpip_emb_data_${Date.now()}.json`);
    writeFileSync(dataFile, JSON.stringify(texts), 'utf-8');
    const script = `import json, sys, numpy as np
try:
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer('BAAI/bge-small-zh-v1.5', device='cpu')
    with open('${dataFile.replace(/\\/g, '\\\\')}', 'r', encoding='utf-8') as f:
        texts = json.load(f)
    embs = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
    print(json.dumps({"dim": embs.shape[1], "vectors": embs.tolist()}))
except Exception as e:
    print(json.dumps({"error": str(e)}))
finally:
    import os
    try: os.remove('${dataFile.replace(/\\/g, '\\\\')}')
    except: pass`;
    return this._callPython(script);
  }

  addDocuments(docs) {
    const texts = docs.map(d => d.text);
    const result = this.computeEmbedding(texts);
    if (!result || result.error) return false;
    this.dim = result.dim || 0;
    for (let i = 0; i < docs.length; i++) {
      this.embeddings.set(docs[i].id, result.vectors[i]);
    }
    return true;
  }

  search(query, topK = 5) {
    if (!this._available || this.embeddings.size === 0) return [];
    const result = this.computeEmbedding([query]);
    if (!result || !result.vectors || result.vectors.length === 0) return [];

    const qVec = result.vectors[0];
    const scores = [];
    for (const [id, vec] of this.embeddings) {
      let dot = 0;
      for (let i = 0; i < vec.length; i++) dot += qVec[i] * vec[i];
      scores.push({ id, score: dot });
    }
    return scores.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  getCachePath(knowledgeDir) {
    const projectRoot = resolve(knowledgeDir, '..', '..');
    const cacheDir = resolve(projectRoot, '.openpip', 'cache');
    if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
    return resolve(cacheDir, 'embedding-index.json');
  }

  loadCache(knowledgeDir) {
    const path = this.getCachePath(knowledgeDir);
    const data = loadJsonFile(path, null);
    if (!data) return false;
    this.dim = data.dim || 0;
    for (const entry of data.vectors || []) {
      this.embeddings.set(entry.id, entry.vector);
    }
    return true;
  }

  saveCache(knowledgeDir) {
    const path = this.getCachePath(knowledgeDir);
    const vectors = [];
    for (const [id, vector] of this.embeddings) {
      vectors.push({ id, vector });
    }
    writeFileSync(path, JSON.stringify({ dim: this.dim, vectors, savedAt: new Date().toISOString() }), 'utf-8');
  }
}

// ============================================================
// HybridSearch：TF-IDF + Embedding 混合检索
// ============================================================

class HybridSearch {
  constructor() {
    this.tfidf = new TFIDF();
    this.embedding = new EmbeddingIndex();
    this.documents = [];
    this.useHybrid = false;
  }

  addDocument(id, text, metadata = {}) {
    this.tfidf.addDocument(id, text, metadata);
    this.documents.push({ id, text, metadata });
  }

  build(knowledgeDir) {
    this.tfidf.computeIDF();
    if (this.embedding.available) {
      try {
        const useCache = this.embedding.loadCache(knowledgeDir);
        if (!useCache && this.documents.length > 0) {
          this.embedding.addDocuments(this.documents);
          this.embedding.saveCache(knowledgeDir);
        }
        this.useHybrid = true;
      } catch {
        this.useHybrid = false;
      }
    }
  }

  search(query, topK = 5) {
    const tfidfResults = this.tfidf.search(query, topK * 3);
    if (!this.useHybrid) return tfidfResults.slice(0, topK);

    const embResults = this.embedding.search(query, topK * 3);
    if (embResults.length === 0) return tfidfResults.slice(0, topK);

    const combined = new Map();
    for (const r of tfidfResults) {
      combined.set(r.id, { ...r, tfidfScore: r.score, embScore: 0, hybridScore: r.score * 0.4 });
    }
    for (const r of embResults) {
      if (combined.has(r.id)) {
        const c = combined.get(r.id);
        c.embScore = r.score;
        c.hybridScore = c.tfidfScore * 0.4 + r.score * 0.6;
      } else {
        combined.set(r.id, { id: r.id, text: '', metadata: {}, score: 0, tfidfScore: 0, embScore: r.score, hybridScore: r.score * 0.6 });
      }
    }
    return Array.from(combined.values())
      .sort((a, b) => b.hybridScore - a.hybridScore)
      .slice(0, topK);
  }
}

// ============================================================
// TF-IDF 预计算缓存
// ============================================================
function computeDirHash(knowledgeDir) {
  const hash = crypto.createHash('sha256');
  const allFiles = collectFiles(knowledgeDir);
  const mdFiles = allFiles
    .filter(f => f.name.endsWith('.md'))
    .map(f => ({
      relativePath: relative(knowledgeDir, f.path).replace(/\\/g, '/'),
      mtimeMs: f.mtime.getTime(),
    }))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  for (const f of mdFiles) {
    hash.update(f.relativePath + ':' + f.mtimeMs);
  }
  return hash.digest('hex').slice(0, 16);
}

function getCachePath(knowledgeDir) {
  const projectRoot = resolve(knowledgeDir, '..', '..');
  return resolve(projectRoot, '.openpip', 'cache');
}

function loadCachedIndex(knowledgeDir) {
  const cacheDir = getCachePath(knowledgeDir);
  const cacheFile = resolve(cacheDir, 'tfidf-cache.json');
  const data = loadJsonFile(cacheFile, null);
  if (!data) return null;
  const currentHash = computeDirHash(knowledgeDir);
  if (data.dirHash !== currentHash) return null;
  const tfidf = new TFIDF();
  tfidf.documents = data.documents || [];
  tfidf.vocab = new Map(Object.entries(data.vocab || {}));
  tfidf.idf = new Map(Object.entries(data.idf || {}));
  return tfidf;
}

function saveCachedIndex(knowledgeDir, tfidf) {
  const cacheDir = getCachePath(knowledgeDir);
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
  const cacheFile = resolve(cacheDir, 'tfidf-cache.json');
  const data = {
    dirHash: computeDirHash(knowledgeDir),
    documents: tfidf.documents.map(d => ({ id: d.id, text: d.text, tokens: d.tokens, metadata: d.metadata })),
    vocab: Object.fromEntries(tfidf.vocab),
    idf: Object.fromEntries(tfidf.idf),
    cachedAt: new Date().toISOString(),
  };
  writeFileSync(cacheFile, JSON.stringify(data), 'utf-8');
}

function chunkDocument(text, chunkSize = 500, overlap = 100) {
  const chunks = [];
  const lines = text.split('\n');
  let currentChunk = '';
  let currentSize = 0;

  for (const line of lines) {
    if (currentSize + line.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      const overlapText = currentChunk.slice(-overlap);
      currentChunk = overlapText + '\n' + line;
      currentSize = currentChunk.length;
    } else {
      currentChunk += '\n' + line;
      currentSize += line.length;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

function buildKnowledgeIndex(knowledgeDir, options = {}) {
  if (options.useCache !== false) {
    const cached = loadCachedIndex(knowledgeDir);
    if (cached) return cached;
  }
  const tfidf = new TFIDF();

  walkDir(knowledgeDir, (fullPath, entry, _stat) => {
    if (!entry.endsWith('.md')) return;
    const relativePath = relative(knowledgeDir, fullPath).replace(/\\/g, '/');
    const lastSlash = relativePath.lastIndexOf('/');
    const prefix = lastSlash >= 0 ? relativePath.slice(0, lastSlash + 1) : '';
    const content = readFileSync(fullPath, 'utf-8');
    const chunks = chunkDocument(content);

    for (let i = 0; i < chunks.length; i++) {
      tfidf.addDocument(`${prefix}${entry}:${i}`, chunks[i], {
        file: `${prefix}${entry}`,
        chunkIndex: i,
        startLine: i * 10,
      });
    }
  });

  tfidf.computeIDF();
  if (options.useCache !== false) {
    try { saveCachedIndex(knowledgeDir, tfidf); } catch {}
  }
  return tfidf;
}

function searchKnowledge(index, query, topK = 5) {
  return index.search(query, topK);
}

function extractSearchQuery(rawTask) {
  const clean = rawTask
    .replace(/subtask:\s*\w[\w-]*\s*/gi, '')
    .replace(/mode:\s*\w+\s*/gi, '')
    .replace(/chapter:\s*\d+\s*/gi, '')
    .replace(/你是 OpenPip 的.*?Agent/gi, '')
    .replace(/## 当前任务|## 项目目录|## 你的角色定义|## 参考知识|## 共享状态切片|## 共享状态切片.*/s, '')
    .trim();
  const lines = clean.split('\n').filter(l => l.trim().length > 5);
  return lines.slice(0, 3).join(' ').slice(0, 300);
}

function loadKnowledgeHybrid(knownPaths, knowledgeDir, query, options = {}) {
  const { coreRules = ['writing/academic-style.md', 'format/gb7714.md'], topK = 5 } = options;

  const parts = [];

  for (const rule of coreRules) {
    const filePath = resolve(knowledgeDir, rule);
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf-8');
      parts.push(`\n\n--- [核心规则] ${rule} ---\n${content}`);
    }
  }

  let tfidf = loadCachedIndex(knowledgeDir);
  if (!tfidf) {
    tfidf = buildKnowledgeIndex(knowledgeDir, { useCache: true });
  }

  const searchQuery = extractSearchQuery(query);

  const hybrid = new HybridSearch();
  hybrid.tfidf = tfidf;
  hybrid.documents = tfidf.documents;
  hybrid.useHybrid = false;

  if (hybrid.embedding.available) {
    try {
      const loaded = hybrid.embedding.loadCache(knowledgeDir);
      if (!loaded && hybrid.documents.length > 0) {
        console.log(`  🧠 构建向量索引 (${hybrid.documents.length} 个文档块)...`);
        const ok = hybrid.embedding.addDocuments(hybrid.documents);
        if (ok) {
          hybrid.embedding.saveCache(knowledgeDir);
          hybrid.useHybrid = true;
          console.log(`  🧠 向量索引构建完成 (dim=${hybrid.embedding.dim})`);
        }
      } else if (loaded && hybrid.embedding.embeddings.size > 0) {
        hybrid.useHybrid = true;
      }
    } catch (err) {
      console.warn(`  ⚠️ 向量检索不可用，回退 TF-IDF: ${err.message}`);
    }
  }

  let results;
  let mode;

  if (hybrid.useHybrid) {
    results = hybrid.search(searchQuery, topK);
    mode = 'TF-IDF+Embedding';
  } else {
    results = tfidf.search(searchQuery, topK);
    mode = 'TF-IDF';
  }

  for (const result of results) {
    if (coreRules.some(r => result.metadata?.file === r)) continue;
    const score = result.hybridScore !== undefined ? result.hybridScore : result.score;
    if (score < 0.01) continue;
    parts.push(`\n\n--- [检索知识] ${result.metadata?.file || result.id} (${mode}: ${(score * 100).toFixed(1)}%) ---\n${result.text || ''}`);
  }

  const stats = { mode, chunks: results.length, score: results.length > 0 ? results[0].score : 0 };
  console.log(`  📚 RAG: ${mode} | query="${searchQuery.slice(0, 60)}..." | top=${results.length} chunks | best=${(stats.score * 100).toFixed(1)}%`);

  return parts.join('');
}

function precomputeIndex(knowledgeDir) {
  const index = buildKnowledgeIndex(knowledgeDir, { useCache: false });
  saveCachedIndex(knowledgeDir, index);
  const files = new Set();
  for (const d of index.documents) {
    const file = d.metadata?.file;
    if (file) files.add(file);
  }
  return {
    filesProcessed: files.size,
    chunksCount: index.documents.length,
    vocabSize: index.vocab.size,
    cachePath: getCachePath(knowledgeDir),
  };
}

module.exports = { TFIDF, EmbeddingIndex, HybridSearch, chunkDocument, buildKnowledgeIndex, searchKnowledge, loadKnowledgeHybrid, loadCachedIndex, saveCachedIndex, computeDirHash, precomputeIndex, extractSearchQuery };


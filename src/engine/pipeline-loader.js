const { existsSync } = require('fs');
const { resolve } = require('path');
const { loadYaml, loadJsonFile } = require('./utils');

const PIPELINES_DIR = '.openpip/pipelines';

class PipelineLoader {
  constructor(root) {
    this.root = root;
    this.pipelinesDir = resolve(root, PIPELINES_DIR);
    this._metaCache = null;
  }

  /**
   * 扫描所有管线 YAML，提取 category/domain 元数据（带缓存）
   */
  _loadAllMeta() {
    if (this._metaCache) return this._metaCache;
    const meta = {};
    if (!existsSync(this.pipelinesDir)) { this._metaCache = meta; return meta; }
    const { readdirSync } = require('fs');
    for (const file of readdirSync(this.pipelinesDir)) {
      if (!file.endsWith('.yaml')) continue;
      const name = file.replace('.yaml', '');
      try {
        const data = loadYaml(resolve(this.pipelinesDir, file), null);
        if (data && !data.ref) {
          meta[name] = {
            category: data.category || 'research',
            domain: data.domain || 'general',
            label: data.description || name,
          };
        } else if (data && data.ref) {
          // alias: inherit category/domain from target
          const target = loadYaml(resolve(this.pipelinesDir, `${data.ref}.yaml`), null);
          meta[name] = {
            category: target?.category || 'research',
            domain: target?.domain || 'general',
            label: data.description || target?.description || name,
          };
        }
      } catch {}
    }
    this._metaCache = meta;
    return meta;
  }

  listCategories() {
    const meta = this._loadAllMeta();
    const categories = {};
    for (const [, m] of Object.entries(meta)) {
      const cat = m.category;
      if (!categories[cat]) categories[cat] = { name: cat, domains: [] };
      if (!categories[cat].domains.includes(m.domain)) {
        categories[cat].domains.push(m.domain);
      }
    }
    return Object.values(categories);
  }

  listPipelines(category) {
    const meta = this._loadAllMeta();
    const pipelines = [];
    for (const [name, m] of Object.entries(meta)) {
      if (category && m.category !== category) continue;
      const filePath = resolve(this.pipelinesDir, `${name}.yaml`);
      if (!existsSync(filePath)) continue;
      try {
        const pipeline = loadYaml(filePath, null);
        pipelines.push({
          name: pipeline.name || name,
          description: pipeline.description || m.label,
          category: m.category,
          domain: m.domain,
          stages: pipeline.stages?.length || 0,
        });
      } catch (e) {
        // YAML 解析失败，跳过损坏的管线配置
      }
    }
    return pipelines;
  }

  loadPipelineByName(name) {
    const filePath = resolve(this.pipelinesDir, `${name}.yaml`);
    if (!existsSync(filePath)) return null;
    try {
      return loadYaml(filePath, null);
    } catch { return null; }
  }

  /**
   * 根据 category + domain 选择并加载管线模板
   * @param {string} category - research / competition
   * @param {string} domain - general / cs / math-modeling / data-science / ...
   * @returns {object|null} 管线配置对象
   */
  loadPipelineTemplate(category, domain) {
    const meta = this._loadAllMeta();
    // 1. 精确匹配 category + domain
    for (const [name, m] of Object.entries(meta)) {
      if (m.category === category && m.domain === domain) {
        const pipeline = this.loadPipelineByName(name);
        if (pipeline) return pipeline;
      }
    }
    // 2. 同 category 任意 domain 回退
    for (const [name, m] of Object.entries(meta)) {
      if (m.category === category) {
        const pipeline = this.loadPipelineByName(name);
        if (pipeline) return pipeline;
      }
    }
    // 3. 默认 lightweight
    return this.loadPipelineByName('lightweight');
  }

  resolvePipeline(projectDir, preferredName) {
    // 1. Explicit name
    if (preferredName) {
      const pipeline = this.loadPipelineByName(preferredName);
      if (pipeline) return pipeline;
    }

    // 2. Project-level override
    const projectPipeline = resolve(projectDir, '.openpip', 'pipeline.yaml');
    if (existsSync(projectPipeline)) {
      const result = loadYaml(projectPipeline, null);
      if (result) return result;
    }

    // 3. Project config → category/domain → default pipeline
    const projectJson = resolve(projectDir, 'project.json');
    const config = loadJsonFile(projectJson, null);
    if (config) {
      const cat = config.category || 'research';
      const domain = config.domain || 'general';

      // Find matching pipeline by category/domain
      const meta = this._loadAllMeta();
      for (const [name, m] of Object.entries(meta)) {
        if (m.category === cat && m.domain === domain) {
          const pipeline = this.loadPipelineByName(name);
          if (pipeline) return pipeline;
        }
      }
      // Fallback to category default
      const fallbackName = cat === 'competition' ? 'competition-general' : 'lightweight';
      const pipeline = this.loadPipelineByName(fallbackName);
      if (pipeline) return pipeline;
    }

    // 4. Default lightweight
    return this.loadPipelineByName('lightweight');
  }

  detectCategoryFromTopic(topic) {
    const t = (topic || '').toLowerCase();
    if (t.includes('竞赛') || t.includes('比赛') || t.includes('mcm') || t.includes('icm')
        || t.includes('cumcm') || t.includes('国赛') || t.includes('美赛')
        || t.includes('华数杯') || t.includes('华为杯') || t.includes('mathorcup')) {
      if (t.includes('数据') || t.includes('机器学习') || t.includes('kaggle')) {
        return { category: 'competition', domain: 'data-science' };
      }
      return { category: 'competition', domain: 'math-modeling' };
    }
    if (t.includes('算法') || t.includes('深度学习') || t.includes('transformer')
        || t.includes('神经网络') || t.includes('计算机') || t.includes('nlp')
        || t.includes('cv') || t.includes('llm') || t.includes('agent')) {
      return { category: 'research', domain: 'cs' };
    }
    if (t.includes('数学') || t.includes('拓扑') || t.includes('代数')
        || t.includes('分析') || t.includes('微分方程')) {
      return { category: 'research', domain: 'math' };
    }
    if (t.includes('工程') || t.includes('机械') || t.includes('电子')
        || t.includes('通信') || t.includes('控制')) {
      return { category: 'research', domain: 'engineering' };
    }
    return { category: 'research', domain: 'general' };
  }
}

module.exports = { PipelineLoader };

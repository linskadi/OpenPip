/**
 * ResourceResolver — 四层资源覆盖引擎
 *
 * 优先级: CLI 参数 > 项目级 > 用户级(HOME) > 全局内置
 *
 * 路径映射:
 *   全局内置 (只读): {projectRoot}/.openpip/
 *   用户级 (共享):   ~/.openpip/
 *   项目级 (专属):   papers/{projectName}/.openpip/
 *
 * 合并策略:
 *   REPLACE   — 找到第一个就停（角色配置/Prompt）
 *   EXTEND    — 层层叠加去重（知识文件列表）
 *   DEEP      — 深度合并覆盖（YAML/JSON配置）
 */

const { resolve: pathResolve } = require('path');
const { existsSync, readdirSync, readFileSync } = require('fs');
const { homedir } = require('os');
const { loadYaml, deepMerge } = require('./utils');
const { ResourceManager } = require('./resource-manager');

// ─── 核心类 ───────────────────────────────────────────────────────────

class ResourceResolver {
  /**
   * @param {string} projectRoot 项目根目录（含 .openpip/）
   * @param {string|null} activeProject 当前活跃项目名（如 "my-paper"）
   */
  constructor(projectRoot, activeProject = null) {
    this.projectRoot = projectRoot;
    this.activeProject = activeProject;

    // 三层路径
    this.globalDir = pathResolve(projectRoot, '.openpip');
    this.userDir = pathResolve(homedir(), '.openpip');
    this.projectDir = activeProject
      ? pathResolve(projectRoot, 'papers', activeProject, '.openpip')
      : null;

    // 资源管理器（缓存 + 热加载）
    this._resourceManager = new ResourceManager(this.globalDir);
  }

  /**
   * 获取资源管理器实例（用于启动文件监听等）
   */
  getResourceManager() {
    return this._resourceManager;
  }

  /**
   * 带缓存的文件读取
   * @param {string} filePath 绝对路径
   * @returns {string|null}
   */
  readFileCached(filePath) {
    return this._resourceManager.load(filePath);
  }

  /**
   * 清除缓存（文件变更后调用）
   */
  invalidateCache(filePath) {
    if (filePath) {
      this._resourceManager.invalidate(filePath);
    } else {
      this._resourceManager.invalidateAll();
    }
  }

  /**
   * 设置/切换活跃项目
   */
  setProject(projectName) {
    this.activeProject = projectName;
    this.projectDir = projectName
      ? pathResolve(this.projectRoot, 'papers', projectName, '.openpip')
      : null;
  }

  // ─── 角色配置 ─────────────────────────────────────────────────────

  /**
   * 按 REPLACE 策略查找角色 YAML 配置路径
   * 优先级: 项目 > 用户 > 全局
   */
  resolveRoleConfig(name) {
    const subdir = 'role-configs';
    const filename = `${name}.yaml`;

    const paths = [
      this.projectDir && pathResolve(this.projectDir, subdir, filename),
      pathResolve(this.userDir, subdir, filename),
      pathResolve(this.globalDir, subdir, filename),
    ];

    for (const p of paths) {
      if (p && existsSync(p)) return p;
    }
    return null;
  }

  /**
   * 按 REPLACE 策略查找角色 Prompt Markdown
   */
  resolveRolePrompt(name) {
    const subdir = 'role-prompts';
    const filename = `${name}.md`;

    const paths = [
      this.projectDir && pathResolve(this.projectDir, subdir, filename),
      pathResolve(this.userDir, subdir, filename),
      pathResolve(this.globalDir, subdir, filename),
    ];

    for (const p of paths) {
      if (p && existsSync(p)) return p;
    }
    return null;
  }

  // ─── 知识文件 ─────────────────────────────────────────────────────

  /**
   * 获取知识目录路径列表（用于需要目录级操作的场景）
   * 顺序: 全局 > 用户 > 项目（与 EXTEND 一致，但返回目录而非文件）
   */
  resolveKnowledgeDirs() {
    const dirs = [];
    if (existsSync(pathResolve(this.globalDir, 'knowledge'))) {
      dirs.push(pathResolve(this.globalDir, 'knowledge'));
    }
    if (existsSync(pathResolve(this.userDir, 'knowledge'))) {
      dirs.push(pathResolve(this.userDir, 'knowledge'));
    }
    if (this.projectDir && existsSync(pathResolve(this.projectDir, 'knowledge'))) {
      dirs.push(pathResolve(this.projectDir, 'knowledge'));
    }
    return dirs;
  }

  // ─── 流水线 ───────────────────────────────────────────────────────

  /**
   * 按 REPLACE 策略查找流水线 YAML
   */
  resolvePipeline(name) {
    const subdir = 'pipelines';
    const filename = `${name}.yaml`;

    const paths = [
      this.projectDir && pathResolve(this.projectDir, subdir, filename),
      pathResolve(this.userDir, subdir, filename),
      pathResolve(this.globalDir, subdir, filename),
    ];

    for (const p of paths) {
      if (p && existsSync(p)) return p;
    }
    return null;
  }

  /**
   * 按 EXTEND 策略收集所有可用的流水线名称
   */
  listPipelines() {
    return this._listInSubdir('pipelines');
  }

  // ─── 投稿地点 ─────────────────────────────────────────────────────

  resolveVenue(name) {
    const subdir = 'venues';
    const filename = `${name}.yaml`;

    const paths = [
      this.projectDir && pathResolve(this.projectDir, subdir, filename),
      pathResolve(this.userDir, subdir, filename),
      pathResolve(this.globalDir, subdir, filename),
    ];

    for (const p of paths) {
      if (p && existsSync(p)) return p;
    }
    return null;
  }

  // ─── 配置 ─────────────────────────────────────────────────────────

  /**
   * 按 DEEP 策略合并三层配置
   */
  resolveConfig() {
    return this._deepMergeConfigs([
      pathResolve(this.globalDir, 'config.json'),
      pathResolve(this.userDir, 'config.json'),
      this.projectDir && pathResolve(this.projectDir, 'project.yaml'),
    ].filter(Boolean));
  }

  /**
   * 获取分类知识映射文件路径
   */
  resolveClassificationMap() {
    const filename = 'classification-knowledge-map.yaml';
    const paths = [
      this.projectDir && pathResolve(this.projectDir, filename),
      pathResolve(this.userDir, filename),
      pathResolve(this.globalDir, filename),
    ];

    for (const p of paths) {
      if (p && existsSync(p)) return p;
    }
    return null;
  }

  /**
   * 获取 prompt 配置文件路径
   */
  resolvePromptConfig() {
    const filename = 'prompt-config.yaml';
    const paths = [
      this.projectDir && pathResolve(this.projectDir, filename),
      pathResolve(this.userDir, filename),
      pathResolve(this.globalDir, filename),
    ];

    for (const p of paths) {
      if (p && existsSync(p)) return p;
    }
    return null;
  }

  // ─── 内部工具 ─────────────────────────────────────────────────────

  /**
   * 列出指定子目录下的所有文件（去 .yaml/.yml 后缀作为名称）
   */
  _listInSubdir(subdir) {
    const names = new Set();

    const dirs = [
      pathResolve(this.globalDir, subdir),
      pathResolve(this.userDir, subdir),
      this.projectDir && pathResolve(this.projectDir, subdir),
    ].filter(Boolean);

    for (const dir of dirs) {
      if (!existsSync(dir)) continue;
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (entry.endsWith('.yaml') || entry.endsWith('.yml')) {
          names.add(entry.replace(/\.(yaml|yml)$/, ''));
        }
      }
    }

    return [...names].sort();
  }

  /**
   * 深度合并多个 JSON/YAML 配置文件
   * 后者覆盖前者（真正覆盖，不只是补缺失键）
   */
  _deepMergeConfigs(paths) {
    let result = {};

    for (const configPath of paths) {
      if (!configPath || !existsSync(configPath)) continue;

      let config = {};
      try {
        const content = readFileSync(configPath, 'utf-8');
        if (configPath.endsWith('.yaml') || configPath.endsWith('.yml')) {
          config = loadYaml(configPath, {});
        } else {
          config = JSON.parse(content);
        }
      } catch {
        // skip invalid configs
        continue;
      }

      result = deepMerge(result, config);
    }

    return result;
  }
}

// ─── 单例（仅在需要时创建，避免 HOME 目录 IO） ─────────────────────

let _instance = null;
let _instanceKey = null;

/**
 * 获取 ResourceResolver 实例
 * @param {string} projectRoot 项目根目录
 * @param {string|null} projectName 当前活跃项目
 */
function getResolver(projectRoot, projectName = null) {
  const key = projectRoot || '';
  // projectRoot 变化时重建实例（避免测试间单例污染）
  if (!_instance || _instanceKey !== key) {
    _instance = new ResourceResolver(projectRoot, projectName);
    _instanceKey = key;
  } else if (projectName) {
    _instance.setProject(projectName);
  }
  return _instance;
}

module.exports = {
  ResourceResolver,
  getResolver,
};

/**
 * ResourceManager — 资源缓存与热加载
 *
 * 功能：
 *   1. 文件内容缓存（基于 mtime 检测自动失效）
 *   2. fs.watch 文件监听（500ms 防抖）
 *   3. 手动刷新 API
 *
 * 用法：
 *   const rm = new ResourceManager(openpipDir);
 *   const content = rm.load(filePath);  // 带缓存读取
 *   rm.invalidate(filePath);            // 清除单文件缓存
 *   rm.startWatching();                 // 启动文件监听
 */

const { readFileSync, statSync, watch, readdirSync, existsSync } = require('fs');
const { resolve, relative } = require('path');

class ResourceManager {
  /**
   * @param {string} baseDir 监听的根目录（通常是 .openpip/）
   * @param {object} options
   * @param {number} options.debounceMs 防抖延迟（默认 500ms）
   */
  constructor(baseDir, options = {}) {
    this.baseDir = baseDir;
    this.debounceMs = options.debounceMs || 500;
    this.cache = new Map(); // absolutePath → { content, mtime, size }
    this.watchers = [];
    this._debounceTimers = new Map();
    this._listeners = new Map(); // eventType → Set<fn>
  }

  /**
   * 带缓存读取文件
   * @param {string} filePath 绝对路径
   * @returns {string|null} 文件内容，不存在返回 null
   */
  load(filePath) {
    try {
      const stat = statSync(filePath);
      const cached = this.cache.get(filePath);

      // 缓存命中且未修改
      if (cached && cached.mtime === stat.mtimeMs && cached.size === stat.size) {
        return cached.content;
      }

      // 重新读取
      const content = readFileSync(filePath, 'utf-8');
      this.cache.set(filePath, { content, mtime: stat.mtimeMs, size: stat.size });
      return content;
    } catch {
      return null;
    }
  }

  /**
   * 清除单文件缓存
   */
  invalidate(filePath) {
    this.cache.delete(filePath);
  }

  /**
   * 清除所有缓存
   */
  invalidateAll() {
    this.cache.clear();
  }

  /**
   * 获取缓存统计
   */
  stats() {
    return {
      cachedFiles: this.cache.size,
      watchers: this.watchers.length,
      baseDir: this.baseDir,
    };
  }

  /**
   * 启动文件监听
   * @param {string[]} subdirs 要监听的子目录列表
   */
  startWatching(subdirs = ['pipelines', 'role-prompts', 'role-configs', 'knowledge']) {
    this.stopWatching();

    for (const subdir of subdirs) {
      const watchDir = resolve(this.baseDir, subdir);
      if (!existsSync(watchDir)) continue;

      try {
        const watcher = watch(watchDir, { recursive: true }, (eventType, filename) => {
          if (!filename) return;
          const filePath = resolve(watchDir, filename);

          // 防抖：同一文件短时间内多次触发只处理最后一次
          if (this._debounceTimers.has(filePath)) {
            clearTimeout(this._debounceTimers.get(filePath));
          }
          this._debounceTimers.set(filePath, setTimeout(() => {
            this._debounceTimers.delete(filePath);
            this._handleFileChange(eventType, filePath);
          }, this.debounceMs));
        });

        this.watchers.push(watcher);
      } catch (err) {
        // fs.watch 在某些平台上可能不支持 recursive
        // 静默失败，不影响主流程
      }
    }
  }

  /**
   * 停止所有文件监听
   */
  stopWatching() {
    for (const watcher of this.watchers) {
      try { watcher.close(); } catch {}
    }
    this.watchers = [];
    for (const timer of this._debounceTimers.values()) {
      clearTimeout(timer);
    }
    this._debounceTimers.clear();
  }

  /**
   * 手动触发全量刷新
   */
  reload() {
    this.invalidateAll();
    this._emit('reload', { timestamp: Date.now() });
  }

  /**
   * 注册事件监听
   * @param {'change'|'reload'} event
   * @param {Function} fn
   */
  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(fn);
  }

  /**
   * 移除事件监听
   */
  off(event, fn) {
    this._listeners.get(event)?.delete(fn);
  }

  _emit(event, data) {
    const fns = this._listeners.get(event);
    if (fns) for (const fn of fns) fn(data);
  }

  _handleFileChange(eventType, filePath) {
    // 使缓存失效
    this.invalidate(filePath);
    this._emit('change', { type: eventType, path: filePath, timestamp: Date.now() });
  }
}

// ─── 全局单例 ──────────────────────────────────────────────────────────

let _globalInstance = null;

function getResourceManager(baseDir, options) {
  if (!_globalInstance || _globalInstance.baseDir !== baseDir) {
    _globalInstance = new ResourceManager(baseDir, options);
  }
  return _globalInstance;
}

module.exports = { ResourceManager, getResourceManager };

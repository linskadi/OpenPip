const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs');
const { resolve } = require('path');
const crypto = require('crypto');

const STATE_DIR = 'state';
const BLACKBOARD_FILE = 'blackboard.json';

// 黑板 schema 版本：未来字段变更时递增，触发 migrateBlackboard
const BLACKBOARD_VERSION = 4;

// 历史压缩阈值：超过则保留最近 N 条完整记录，更早的折叠为摘要
const MAX_FULL_HISTORY = 10;
const MAX_SUMMARY_HISTORY = 50;

// ============================================================
// 字段权限矩阵：白名单控制各 agent 的读写范围
// ============================================================
// 设计原则：
//   1. 最小权限原则：每个 agent 只能访问完成其任务所必需的字段
//   2. 单一职责原则：每个字段通常只有 1-2 个 writer，避免多 agent 写入冲突
//   3. 信息流单向性：上游阶段产出 → 下游阶段读取，避免反向污染
//   4. 审计可追溯：所有写入通过 writeField 函数，自动记录到 history
//
// 字段设计意图说明：
//
// ── topic（选题）────────────────────────────────────────────
//   读者：全部 7 个标准 agent（orchestrator/researcher/planner/writer/coder/reviewer/formatter）
//   写者：orchestrator + researcher
//   设计理由：
//     - 选题是所有工作的起点，所有 agent 都需要了解选题方向
//     - orchestrator 可写：总控调度，接收用户输入并初始化选题
//     - researcher 可写：调研过程中可能需要细化/修正选题范围
//     - 其他 agent 不可写：避免写作/审稿过程中随意改变选题
//
// ── mode（模式）────────────────────────────────────────────
//   读者：全部 7 个标准 agent
//   写者：仅 orchestrator
//   设计理由：
//     - 模式（research/competition 等）决定全局工作流，所有 agent 都需知晓
//     - 仅 orchestrator 可写：模式是项目级配置，应由总控统一管理，防止各 agent 自行切换导致混乱
//
// ── research（研究简报）─────────────────────────────────────
//   读者：orchestrator/planner/writer/reviewer/contribution-architect/adversarial-researcher
//   写者：researcher + contribution-architect
//   设计理由：
//     - planner 需要研究简报来设计大纲
//     - writer 需要研究简报作为写作参考
//     - reviewer 需要研究简报来评审论文的研究基础
//     - contribution-architect/adversarial-researcher 是扩展角色，深度参与研究阶段
//     - researcher 可写：主要产出者
//     - contribution-architect 可写：贡献点架构师负责提炼和补充创新点
//     - coder/formatter 不可读：不需要了解研究细节，专注各自任务
//
// ── outline（大纲）─────────────────────────────────────────
//   读者：orchestrator/writer/coder/reviewer
//   写者：仅 planner
//   设计理由：
//     - writer 需要大纲来逐章写作
//     - coder 需要大纲来理解代码在论文中的位置
//     - reviewer 需要大纲来评估论文结构完整性
//     - 仅 planner 可写：大纲是 planner 的核心产出，单一 writer 避免结构混乱
//     - researcher 不可读/写：researcher 专注调研，不干预结构设计
//     - formatter 不可读：formatter 关注最终格式，不需要早期大纲
//
// ── draft（草稿）───────────────────────────────────────────
//   读者：orchestrator/writer/reviewer/formatter
//   写者：writer + formatter
//   设计理由：
//     - writer 是草稿的主要生产者
//     - reviewer 需要读取草稿进行评审
//     - formatter 需要读取草稿进行格式化，也可写入格式化后的版本
//     - researcher/planner/coder 不可读：避免上游角色看到半成品后产生先入为主的偏见
//
// ── memory（一致性记忆）─────────────────────────────────────
//   读者：orchestrator/planner/writer/coder/reviewer/formatter
//   写者：writer + reviewer + coder
//   设计理由：
//     - 记忆是全局共享的术语/变量/引用信息，所有 agent 都可读取以保持一致性
//     - writer 可写：写作过程中发现新术语/变量，实时更新记忆
//     - reviewer 可写：审稿时发现的不一致问题，可直接更新记忆
//     - coder 可写：代码中定义的变量符号，需要同步到记忆表
//     - planner/researcher/formatter 不可写：避免非写作阶段随意修改记忆
//
// ── review（评审结果）──────────────────────────────────────
//   读者：orchestrator/writer/reviewer
//   写者：仅 reviewer
//   设计理由：
//     - orchestrator 需要评审结果来决定下一步动作（Accept/Revise/Reject）
//     - writer 需要根据评审意见进行修改
//     - 仅 reviewer 可写：保证评审的独立性和权威性，防止 writer 篡改评审意见
//     - 其他 agent 不可读：避免评审意见影响其他阶段的工作
//
// ── integrity（完整性检查）─────────────────────────────────
//   读者：orchestrator/reviewer/writer
//   写者：仅 reviewer
//   设计理由：
//     - 完整性检查结果用于验证论文的引用、公式、图表等是否完整
//     - writer 需要读取完整性检查结果来修复问题
//     - 仅 reviewer 可写：保证检查结果的客观性
//     - 其他 agent 不可读：减少信息噪音，专注各自任务
//
// ── history（操作历史）─────────────────────────────────────
//   读者：orchestrator + reviewer
//   写者：全部 7 个标准 agent
//   设计理由：
//     - 所有 agent 的写入操作都会自动追加到 history（通过 writeField 函数）
//     - orchestrator 可读：总控需要了解全局操作历史，用于调度和问题排查
//     - reviewer 可读：评审时可追溯各阶段的修改历史，评估改动合理性
//     - 其他 agent 不可读：避免 agent 根据历史记录进行"迎合"式写作，保持独立性
//
// ── classification（分类）───────────────────────────────────
//   读者：全部 7 个标准 agent
//   写者：仅 orchestrator
//   设计理由：
//     - 论文分类（如数学建模类、科创发明类）影响各 agent 的工作模式
//     - 仅 orchestrator 可写：分类是项目级元数据，应由总控统一判定和管理
//
// ── meta（元数据）──────────────────────────────────────────
//   读者：仅 orchestrator
//   写者：仅 orchestrator
//   设计理由：
//     - 元数据（版本号、更新时间等）是系统内部字段，用于版本迁移和缓存控制
//     - 仅 orchestrator 可读写：其他 agent 不需要也不应该操作系统元数据
// ============================================================
const FIELD_PERMISSIONS = {
  topic:           { readers: ['orchestrator', 'researcher', 'planner', 'writer', 'coder', 'reviewer', 'formatter'], writers: ['orchestrator', 'researcher'] },
  mode:            { readers: ['orchestrator', 'researcher', 'planner', 'writer', 'coder', 'reviewer', 'formatter'], writers: ['orchestrator'] },
  research:        { readers: ['orchestrator', 'planner', 'writer', 'reviewer', 'contribution-architect', 'adversarial-researcher'], writers: ['researcher', 'contribution-architect'] },
  outline:         { readers: ['orchestrator', 'writer', 'coder', 'reviewer'], writers: ['planner'] },
  draft:           { readers: ['orchestrator', 'writer', 'reviewer', 'formatter'], writers: ['writer', 'formatter'] },
  memory:          { readers: ['orchestrator', 'planner', 'writer', 'coder', 'reviewer', 'formatter'], writers: ['writer', 'reviewer', 'coder'] },
  review:          { readers: ['orchestrator', 'writer', 'reviewer'], writers: ['reviewer'] },
  integrity:       { readers: ['orchestrator', 'reviewer', 'writer'], writers: ['reviewer'] },
  history:         { readers: ['orchestrator', 'reviewer'], writers: ['orchestrator', 'researcher', 'planner', 'writer', 'coder', 'reviewer', 'formatter'] },
  classification:  { readers: ['orchestrator', 'researcher', 'planner', 'writer', 'coder', 'reviewer', 'formatter'], writers: ['orchestrator'] },
  meta:            { readers: ['orchestrator'], writers: ['orchestrator'] },
};

function canRead(agentName, field) {
  const perm = FIELD_PERMISSIONS[field];
  if (!perm) return false;
  return perm.readers.includes(agentName);
}

function writeField(bb, agentRole, field, value) {
  const perm = FIELD_PERMISSIONS[field];
  if (!perm) return { ok: false, error: `未知字段: ${field}` };
  if (!perm.writers.includes(agentRole)) {
    return { ok: false, error: `${agentRole} 无权写 ${field}` };
  }
  bb[field] = value;
  appendHistory(bb, { agent: agentRole, action: 'write', field, timestamp: new Date().toISOString() });
  return { ok: true };
}

function getBlackboardPath(projectDir) {
  return resolve(projectDir, STATE_DIR, BLACKBOARD_FILE);
}

function initBlackboard(projectDir) {
  const stateDir = resolve(projectDir, STATE_DIR);
  if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });
  const path = getBlackboardPath(projectDir);
  if (!existsSync(path)) {
    const empty = {
      version: BLACKBOARD_VERSION,
      topic: '',
      mode: 'research',
      classification: null,
      research: { brief: '', refs: [], contribution: null },
      outline: { title: '', chapters: [] },
      draft: { full: '', chapters: [], summary: '', code: '', formatted: '', latex: '' },
      memory: { terms: [], refs: [], symbols: [], figures: [], gapAnalysis: [] },
      review: { score: null, decision: '', issues: [] },
      integrity: { refs: null, formulas: null, figures: null, terms: null },
      history: [],
      meta: { updatedAt: '', version: BLACKBOARD_VERSION },
    };
    writeFileSync(path, JSON.stringify(empty, null, 2), 'utf-8');
    return empty;
  }
  return loadBlackboard(projectDir);
}

function loadBlackboard(projectDir) {
  const path = getBlackboardPath(projectDir);
  if (!existsSync(path)) return initBlackboard(projectDir);
  try {
    const bb = JSON.parse(readFileSync(path, 'utf-8'));
    return migrateBlackboard(bb);
  } catch {
    return initBlackboard(projectDir);
  }
}

function saveBlackboard(projectDir, bb) {
  const path = getBlackboardPath(projectDir);
  const stateDir = resolve(projectDir, STATE_DIR);
  if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });
  bb.meta = bb.meta || {};
  bb.meta.updatedAt = new Date().toISOString();
  bb.meta.version = BLACKBOARD_VERSION;
  bb.version = BLACKBOARD_VERSION;
  writeFileSync(path, JSON.stringify(bb, null, 2), 'utf-8');
}

// ============================================================
// 历史压缩：保留最近 MAX_FULL_HISTORY 条完整记录，更早的折叠为摘要
// ============================================================
function appendHistory(bb, entry) {
  bb.history = bb.history || [];
  bb.history.push({
    timestamp: new Date().toISOString(),
    agent: entry.agent || 'unknown',
    stage: entry.stage || '',
    field: entry.field || '',
    action: entry.action || 'update',
    summary: entry.summary || '',
    // 仅当显式标记 needFull=true 时才保留完整内容（默认走摘要）
    full: entry.needFull ? (entry.full || '') : undefined,
    sizeBytes: entry.full ? entry.full.length : (entry.summary ? entry.summary.length : 0),
  });
  bb.history = compressHistory(bb.history);
  return bb.history;
}

function compressHistory(history) {
  if (!history || history.length <= MAX_FULL_HISTORY) return history || [];

  const recent = history.slice(-MAX_FULL_HISTORY);
  const older = history.slice(0, history.length - MAX_FULL_HISTORY);

  // 把更早的记录折叠为单条摘要（保留统计信息，丢掉 full）
  const summaryEntry = {
    timestamp: older[older.length - 1].timestamp,
    agent: 'system',
    stage: 'compressed',
    field: 'history',
    action: 'compress',
    summary: `[compressed ${older.length} entries]`,
    entries: older.map(h => ({
      timestamp: h.timestamp,
      agent: h.agent,
      stage: h.stage,
      field: h.field,
      action: h.action,
      sizeBytes: h.sizeBytes || 0,
    })),
    sizeBytes: older.reduce((sum, h) => sum + (h.sizeBytes || 0), 0),
  };

  // 若折叠后总数仍超过 MAX_SUMMARY_HISTORY，丢弃最早的摘要条目
  let compressed = [summaryEntry, ...recent];
  if (compressed.length > MAX_SUMMARY_HISTORY) {
    compressed = compressed.slice(-MAX_SUMMARY_HISTORY);
  }
  return compressed;
}

// ============================================================
// 版本迁移：旧版黑板升级到当前 schema
// ============================================================
function migrateBlackboard(bb) {
  if (!bb.version || bb.version < 2) {
    // v1 -> v2: 加 history / 字段权限元数据
    bb.history = bb.history || [];
    bb.version = BLACKBOARD_VERSION;
    bb.meta = bb.meta || {};
    bb.meta.version = BLACKBOARD_VERSION;
    console.log(`  📦 黑板迁移: v1 -> v${BLACKBOARD_VERSION}（已加 history 字段）`);
  }
  if (bb.version < 3) {
    // v2 -> v3: draft.chapters 从对象变为数组
    if (bb.draft && typeof bb.draft.chapters === 'object' && !Array.isArray(bb.draft.chapters)) {
      bb.draft.chapters = Object.values(bb.draft.chapters);
    }
    if (!bb.draft.chapters || !Array.isArray(bb.draft.chapters)) {
      bb.draft.chapters = [];
    }
    bb.version = BLACKBOARD_VERSION;
    bb.meta = bb.meta || {};
    bb.meta.version = BLACKBOARD_VERSION;
    console.log(`  📦 黑板迁移: v2 -> v${BLACKBOARD_VERSION}（draft.chapters 数组化）`);
  }
  if (bb.version < 4) {
    // v3 -> v4: 添加 classification 字段
    if (!bb.classification) {
      bb.classification = null;
    }
    bb.version = BLACKBOARD_VERSION;
    bb.meta = bb.meta || {};
    bb.meta.version = BLACKBOARD_VERSION;
    console.log(`  📦 黑板迁移: v3 -> v${BLACKBOARD_VERSION}（添加 classification 字段）`);
  }
  return bb;
}

// ============================================================
// 字段权限校验：基于 agent 白名单过滤切片
// 注：为兼容旧约定，writer-polish/reviewer/formatter 的 slice.draft 返回 draft.full 字符串
// ============================================================
function sliceFor(agentName, subtask, bb) {
  const draftFull = bb.draft ? bb.draft.full : '';
  // subtask 级别精细化裁剪（在已授权字段内进一步收缩）
  if (agentName === 'writer') {
    if (subtask === 'polish' || subtask === 'summary') {
      // polish/summary 需要 draft 全文 + memory
      return { draft: draftFull, mode: bb.mode, classification: bb.classification, memory: bb.memory };
    }
    // draft 子任务：拿 outline + memory + 前章结尾
    const slice = { outline: bb.outline, memory: bb.memory, mode: bb.mode, classification: bb.classification };
    // 从 draft.chapters 提取前章结尾（如果有章节级存储）
    if (bb.draft && bb.draft.chapters && Array.isArray(bb.draft.chapters) && bb.draft.chapters.length > 0) {
      const lastChapter = bb.draft.chapters.filter(c => c && c.content).slice(-1)[0];
      if (lastChapter && lastChapter.ending) {
        slice.previousChapter = {
          index: lastChapter.index,
          title: lastChapter.title,
          ending: lastChapter.ending,
        };
      }
    }
    return slice;
  }
  if (agentName === 'reviewer') {
    return { draft: draftFull, memory: bb.memory, mode: bb.mode, classification: bb.classification, review: bb.review };
  }
  if (agentName === 'formatter') {
    return { draft: draftFull, memory: bb.memory };
  }
  if (agentName === 'coder') {
    return { outline: bb.outline, memory: bb.memory };
  }
  if (agentName === 'planner') {
    return { mode: bb.mode, classification: bb.classification, research: bb.research };
  }
  if (agentName === 'researcher') {
    return { topic: bb.topic, mode: bb.mode, classification: bb.classification, research: bb.research };
  }
  // orchestrator 默认可见全部已授权字段（按白名单过滤）
  const slice = {};
  for (const field of Object.keys(bb)) {
    if (field === 'meta' || field === 'version') continue;
    if (canRead(agentName, field)) {
      slice[field] = bb[field];
    }
  }
  return slice;
}

// ============================================================
// BlackboardCache：内存缓存层，批量落盘减少 IO
// ============================================================
class BlackboardCache {
  constructor(projectDir, options = {}) {
    this.projectDir = projectDir;
    this.flushInterval = options.flushInterval || 30000;
    this.maxPending = options.maxPending || 5;
    this._cache = null;
    this._dirty = false;
    this._timer = null;
    this._pendingWrites = 0;
  }

  load() {
    if (!this._cache) {
      this._cache = loadBlackboard(this.projectDir);
    }
    return this._cache;
  }

  update(fn) {
    if (!this._cache) this.load();
    fn(this._cache);
    this._dirty = true;
    this._pendingWrites++;
    this._scheduleFlush();
  }

  _scheduleFlush() {
    if (this._timer) return;
    if (this._pendingWrites >= this.maxPending) {
      this.flush();
      return;
    }
    this._timer = setTimeout(() => {
      this._timer = null;
      this.flush();
    }, this.flushInterval);
    if (this._timer.unref) this._timer.unref();
  }

  flush() {
    if (!this._dirty || !this._cache) return;
    saveBlackboard(this.projectDir, this._cache);
    this._dirty = false;
    this._pendingWrites = 0;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  getSnapshot() {
    if (!this._cache) this.load();
    return JSON.parse(JSON.stringify(this._cache));
  }

  checksum() {
    if (!this._cache) return '';
    return crypto.createHash('sha256').update(JSON.stringify(this._cache)).digest('hex').slice(0, 16);
  }

  destroy() {
    this.flush();
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }
}

module.exports = {
  initBlackboard,
  loadBlackboard,
  saveBlackboard,
  sliceFor,
  getBlackboardPath,
  canRead,
  writeField,
  appendHistory,
  compressHistory,
  migrateBlackboard,
  BlackboardCache,
  BLACKBOARD_VERSION,
  FIELD_PERMISSIONS,
};

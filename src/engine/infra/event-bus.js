// Agent 事件总线 - 轻量级发布/订阅模式

const { generateId } = require('../utils');
const { globalTraceContext } = require('./tracing');
const { defaultLogger } = require('./logger');

class EventBus {
  constructor() {
    this.listeners = new Map();
    this.eventHistory = [];
    this.maxHistory = 1000;
  }

  static getInstance() {
    if (!EventBus._instance) {
      EventBus._instance = new EventBus();
    }
    return EventBus._instance;
  }

  on(event, callback, options = {}) {
    const { priority = 0, once = false, filter = null } = options;

    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    const listener = {
      id: generateId('listener'),
      callback,
      priority,
      once,
      filter,
      createdAt: new Date().toISOString(),
    };

    this.listeners.get(event).push(listener);
    this.listeners.get(event).sort((a, b) => b.priority - a.priority);

    return listener.id;
  }

  once(event, callback, options = {}) {
    return this.on(event, callback, { ...options, once: true });
  }

  off(event, listenerId) {
    if (!this.listeners.has(event)) return false;

    const listeners = this.listeners.get(event);
    const index = listeners.findIndex(l => l.id === listenerId);

    if (index === -1) return false;

    listeners.splice(index, 1);
    return true;
  }

  clear(event) {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  async emit(event, data = {}) {
    if (event === 'error' && data instanceof Error) {
      const errorType = data.code || data.constructor.name || 'Error';
      data.type = errorType;
    }

    const traceId = globalTraceContext.getTraceId();
    const dataWithTrace = {
      ...data,
      trace_id: traceId,
    };

    const eventRecord = {
      event,
      data: dataWithTrace,
      timestamp: new Date().toISOString(),
      trace_id: traceId,
      listenersNotified: 0,
      results: [],
    };

    if (!this.listeners.has(event)) {
      this.eventHistory.push(eventRecord);
      if (this.eventHistory.length > this.maxHistory) {
        this.eventHistory.shift();
      }
      return eventRecord;
    }

    const listeners = [...this.listeners.get(event)];
    const toRemove = [];

    for (const listener of listeners) {
      // 应用过滤器
      if (listener.filter && !listener.filter(data)) {
        continue;
      }

      try {
        const result = await listener.callback(data);
        eventRecord.results.push({
          listenerId: listener.id,
          success: true,
          result,
        });
        eventRecord.listenersNotified++;

        if (listener.once) {
          toRemove.push(listener.id);
        }
      } catch (err) {
        eventRecord.results.push({
          listenerId: listener.id,
          success: false,
          error: err.message,
        });
      }
    }

    // 移除一次性监听器
    for (const id of toRemove) {
      this.off(event, id);
    }

    this.eventHistory.push(eventRecord);
    if (this.eventHistory.length > this.maxHistory) {
      this.eventHistory.shift();
    }

    return eventRecord;
  }

  emitSync(event, data = {}) {
    if (event === 'error' && data instanceof Error) {
      const errorType = data.code || data.constructor.name || 'Error';
      data.type = errorType;
    }

    const traceId = globalTraceContext.getTraceId();
    const dataWithTrace = {
      ...data,
      trace_id: traceId,
    };

    if (!this.listeners.has(event)) return;

    const listeners = [...this.listeners.get(event)];

    for (const listener of listeners) {
      if (listener.filter && !listener.filter(dataWithTrace)) continue;

      try {
        listener.callback(dataWithTrace);
      } catch (err) {
        defaultLogger.error('EventBus sync error', { event, error: err.message });
      }
    }
  }

  getHistory(event = null, limit = 50) {
    let history = this.eventHistory;
    if (event) {
      history = history.filter(e => e.event === event);
    }
    return history.slice(-limit);
  }

  getStats() {
    const stats = {
      totalEvents: this.eventHistory.length,
      eventsByType: {},
      recentEvents: this.eventHistory.slice(-10),
    };

    for (const record of this.eventHistory) {
      stats.eventsByType[record.event] = (stats.eventsByType[record.event] || 0) + 1;
    }

    return stats;
  }
}

// 预定义事件类型
const EVENT_TYPES = {
  // 流水线事件
  PIPELINE_START: 'pipeline:start',
  PIPELINE_STAGE_START: 'pipeline:stage:start',
  PIPELINE_STAGE_COMPLETE: 'pipeline:stage:complete',
  PIPELINE_STAGE_FAIL: 'pipeline:stage:fail',
  PIPELINE_COMPLETE: 'pipeline:complete',
  PIPELINE_FAIL: 'pipeline:fail',

  // Agent 事件
  AGENT_DISPATCH: 'agent:dispatch',
  AGENT_COMPLETE: 'agent:complete',
  AGENT_FAIL: 'agent:fail',
  AGENT_HELP: 'agent:help',

  // 质量事件
  QUALITY_CHECK_START: 'quality:check:start',
  QUALITY_CHECK_PASS: 'quality:check:pass',
  QUALITY_CHECK_FAIL: 'quality:check:fail',
  QUALITY_RETRY: 'quality:retry',

  // 知识事件
  KNOWLEDGE_CANDIDATE: 'knowledge:candidate',
  KNOWLEDGE_APPROVE: 'knowledge:approve',
  KNOWLEDGE_REJECT: 'knowledge:reject',

  // 版本事件
  VERSION_SNAPSHOT: 'version:snapshot',
  VERSION_REVERT: 'version:revert',

  // 进度事件
  PROGRESS_UPDATE: 'progress:update',
  CHAPTER_DONE: 'chapter:done',
  STAGE_COMPLETE: 'stage:complete',

  // 异常事件
  ERROR_OCCURRED: 'error:occurred',
  REWRITE_TRIGGERED: 'rewrite:triggered',

  // B8: 反向大纲 drift
  OUTLINE_DRIFT: 'outline:drift',

  // P5.2: Hook 事件
  HOOK_FAILED: 'hook:failed',
  HOOK_DOWNGRADE: 'hook:downgrade',
};

module.exports = {
  EventBus,
  EVENT_TYPES,
};

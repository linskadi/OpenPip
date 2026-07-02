const { globalTraceContext } = require('./tracing');

const LOG_LEVELS = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

class Logger {
  constructor(options = {}) {
    this.level = options.level || 'info';
    this.enabled = options.enabled !== false;
    this.name = options.name || 'openpip';
  }

  setLevel(level) {
    this.level = level;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  _isLevelEnabled(level) {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  _formatLog(level, message, data = {}) {
    const traceId = globalTraceContext.getTraceId();
    const logEntry = {
      time: new Date().toISOString(),
      level,
      name: this.name,
      message,
      trace_id: traceId,
      ...data,
    };
    return logEntry;
  }

  _log(level, message, data) {
    if (!this.enabled || !this._isLevelEnabled(level)) return;
    const entry = this._formatLog(level, message, data);
    
    if (level === 'error' || level === 'fatal') {
      console.error(JSON.stringify(entry));
    } else if (level === 'warn') {
      console.warn(JSON.stringify(entry));
    } else {
      console.log(JSON.stringify(entry));
    }
  }

  trace(message, data) {
    this._log('trace', message, data);
  }

  debug(message, data) {
    this._log('debug', message, data);
  }

  info(message, data) {
    this._log('info', message, data);
  }

  warn(message, data) {
    this._log('warn', message, data);
  }

  error(message, data) {
    this._log('error', message, data);
  }

  fatal(message, data) {
    this._log('fatal', message, data);
  }

  child(options = {}) {
    return new Logger({
      level: this.level,
      enabled: this.enabled,
      name: options.name ? `${this.name}:${options.name}` : this.name,
    });
  }
}

const defaultLogger = new Logger();

module.exports = {
  Logger,
  defaultLogger,
  LOG_LEVELS,
};

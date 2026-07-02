const crypto = require('crypto');

function generateTraceId() {
  const timestamp = Date.now();
  const random = crypto.randomBytes(3).toString('hex');
  return `op_${timestamp}_${random}`;
}

function generateRequestId(traceId, sequence) {
  return `${traceId}_req_${sequence}`;
}

class TraceContext {
  constructor() {
    this._traceId = null;
    this._requestCounter = 0;
    this._enabled = true;
    this._metadata = {};
  }

  setEnabled(enabled) {
    this._enabled = enabled;
  }

  isEnabled() {
    return this._enabled;
  }

  startTrace(metadata = {}) {
    this._traceId = generateTraceId();
    this._requestCounter = 0;
    this._metadata = { ...metadata };
    return this._traceId;
  }

  setTraceId(traceId) {
    this._traceId = traceId;
  }

  getTraceId() {
    return this._traceId;
  }

  getMetadata() {
    return { ...this._metadata };
  }

  setMetadata(key, value) {
    this._metadata[key] = value;
  }

  nextRequestId() {
    if (!this._traceId) return null;
    this._requestCounter++;
    return generateRequestId(this._traceId, this._requestCounter);
  }

  getRequestCount() {
    return this._requestCounter;
  }

  reset() {
    this._traceId = null;
    this._requestCounter = 0;
    this._metadata = {};
  }

  withTrace(traceId, fn) {
    const oldTraceId = this._traceId;
    this._traceId = traceId;
    try {
      return fn();
    } finally {
      this._traceId = oldTraceId;
    }
  }
}

const globalTraceContext = new TraceContext();

module.exports = {
  generateTraceId,
  generateRequestId,
  TraceContext,
  globalTraceContext,
};

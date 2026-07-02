const base = require('./base');

const cli = {
  ...base,
  name: 'cli',
  description: '独立 CLI 运行时 — 直接调用 engine 模块',

  async callLLM(prompt, options = {}) {
    const engine = require('../engine');
    const config = options.config || { api_keys: { deepseek: process.env.DEEPSEEK_API_KEY || '' } };
    const { DEFAULT_MODEL } = require('../engine/constants');
    return await engine.callLLM(DEFAULT_MODEL, prompt, config);
  },
};

module.exports = cli;

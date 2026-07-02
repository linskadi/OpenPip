const cli = require('./cli');
const agent = require('./agent');

const adapters = {
  cli,
  agent,
};

function getAdapter(name) {
  const adapter = adapters[name];
  if (!adapter) {
    throw new Error(`未知的适配器: ${name}。可用: ${Object.keys(adapters).join(', ')}`);
  }
  return adapter;
}

function listAdapters() {
  return Object.entries(adapters).map(([key, a]) => ({
    name: key,
    description: a.description,
  }));
}

module.exports = {
  cli,
  agent,
  getAdapter,
  listAdapters,
};

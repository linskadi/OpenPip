const commands = {
  config: require('./config'),
  init: require('./init'),
  new: require('./init'),
  run: require('./run'),
  chat: require('./chat'),
  evolve: require('./evolve'),
  annotate: require('./annotate'),
  agent: require('./agent'),
  doctor: require('./doctor'),
  export: require('./export-cmd'),
  index: require('./index-cmd'),
  status: require('./status'),
  tui: require('./tui-cmd'),
  resource: require('./resource'),
  history: require('./history'),
};

function getCommand(name) {
  return commands[name] || null;
}

module.exports = { commands, getCommand };

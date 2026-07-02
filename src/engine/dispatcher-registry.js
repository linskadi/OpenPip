const { dispatchRoleWithState } = require('./roles/dispatcher');

let defaultDispatcher = null;

module.exports = {
  setDefaultDispatcher(fn) { defaultDispatcher = fn; },
  getDefaultDispatcher() { return defaultDispatcher || dispatchRoleWithState; },
};

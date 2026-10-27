const { AsyncLocalStorage } = require("node:async_hooks");

const requestUser = new AsyncLocalStorage();

function currentRequestUser() {
  return requestUser.getStore()?.user || null;
}

function runWithUser(user, fn) {
  return requestUser.run({ user }, fn);
}

module.exports = { currentRequestUser, runWithUser };

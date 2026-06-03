// Shared test helpers for the Azure Functions (classic v3 model).
// A function is just `module.exports = async (context, req)`, so we invoke it
// directly with a fake context/req and read context.res.

const { setVerifier } = require('../shared/auth');
const { setFactory }  = require('../shared/anthropic');

// Stub the token verifier so tests never call Microsoft Graph. By default
// returns a valid principal (shaped like the Graph /me result).
function stubAuthValid(payload = {}) {
  setVerifier(async () => ({
    oid: 'user-oid',
    email: 'test.user@wsd.com',
    name: 'Test User',
    ...payload,
  }));
}
function stubAuthInvalid() {
  setVerifier(async () => { throw new Error('invalid token'); });
}

// Stub the Anthropic client factory. `reply` is the text the model "returns".
function stubAnthropic(reply) {
  setFactory(() => ({
    messages: {
      create: async () => ({ content: [{ type: 'text', text: reply }] }),
    },
  }));
}
function stubAnthropicThrows() {
  setFactory(() => ({
    messages: { create: async () => { throw new Error('upstream down'); } },
  }));
}

function makeContext() {
  const logs = [];
  const log = (...args) => logs.push(args.join(' '));
  log.error = (...a) => logs.push(['ERROR', ...a].join(' '));
  log.warn  = (...a) => logs.push(['WARN',  ...a].join(' '));
  log.info  = (...a) => logs.push(['INFO',  ...a].join(' '));
  return { log, logs, res: undefined };
}

function makeReq({ method = 'GET', query = {}, headers = {}, body = null, auth = true } = {}) {
  const h = { ...headers };
  if (auth && !h.authorization && !h.Authorization) h.authorization = 'Bearer test-token';
  return { method, query, headers: h, body };
}

module.exports = {
  stubAuthValid, stubAuthInvalid, stubAnthropic, stubAnthropicThrows,
  makeContext, makeReq,
};

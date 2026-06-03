// Shared test helpers for the Azure Functions (classic v3 model).
// A function is just `module.exports = async (context, req)`, so we invoke it
// directly with a fake context/req and read context.res.

const { setVerifier } = require('../shared/auth');
const { setFactory }  = require('../shared/anthropic');

// Stub the JWT verifier so tests never hit AAD JWKS. By default returns a valid
// payload in the expected tenant.
function stubAuthValid(payload = {}) {
  setVerifier(async () => ({
    tid: 'a3be1280-7a3a-4edc-b258-0d6a539beee9',
    oid: 'user-oid',
    preferred_username: 'test.user@wsd.com',
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

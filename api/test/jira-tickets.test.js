const { test } = require('node:test');
const assert = require('node:assert/strict');

const jira = require('../jira-tickets');
const http = require('../shared/http');
const { stubAuthValid, stubAuthInvalid, makeContext, makeReq } = require('./helpers');

const ORIG_TOKEN = process.env.JIRA_TOKEN;
function withToken() { process.env.JIRA_TOKEN = 'test-token'; }
function restore() {
  if (ORIG_TOKEN === undefined) delete process.env.JIRA_TOKEN;
  else process.env.JIRA_TOKEN = ORIG_TOKEN;
  http.setRequestJson(null);
}

test('happy path returns 200 with issues', async () => {
  withToken();
  stubAuthValid();
  http.setRequestJson(async () => ({ issues: [{ key: 'DW-1' }], total: 1 }));
  const ctx = makeContext();
  await jira(ctx, makeReq({ query: { user: 'test.user@wsd.com' } }));
  assert.equal(ctx.res.status, 200);
  assert.equal(ctx.res.body.issues.length, 1);
  assert.equal(ctx.res.body.error, null);
  restore();
});

test('JQL injection in user param is rejected with 400', async () => {
  withToken();
  stubAuthValid();
  const ctx = makeContext();
  await jira(ctx, makeReq({ query: { user: 'evil" OR 1=1' } }));
  assert.equal(ctx.res.status, 400);
  assert.equal(ctx.res.body.error.code, 'FIELD_VALIDATION_FAILED');
  restore();
});

test('missing bearer token returns 401', async () => {
  withToken();
  stubAuthValid();
  const ctx = makeContext();
  await jira(ctx, makeReq({ auth: false }));
  assert.equal(ctx.res.status, 401);
  assert.equal(ctx.res.body.error.type, 'authentication');
  restore();
});

test('invalid token returns 401', async () => {
  withToken();
  stubAuthInvalid();
  const ctx = makeContext();
  await jira(ctx, makeReq({ query: { user: 'test.user@wsd.com' } }));
  assert.equal(ctx.res.status, 401);
  restore();
});

test('upstream 401 maps to 502 JIRA_AUTH_FAILED', async () => {
  withToken();
  stubAuthValid();
  http.setRequestJson(async () => { const e = new Error('x'); e.statusCode = 401; throw e; });
  const ctx = makeContext();
  await jira(ctx, makeReq({ query: { user: 'test.user@wsd.com' } }));
  assert.equal(ctx.res.status, 502);
  assert.equal(ctx.res.body.error.code, 'JIRA_AUTH_FAILED');
  restore();
});

test('upstream non-JSON/other error maps to 502 JIRA_UPSTREAM_ERROR', async () => {
  withToken();
  stubAuthValid();
  http.setRequestJson(async () => { const e = new Error('Invalid JSON'); e.statusCode = 500; throw e; });
  const ctx = makeContext();
  await jira(ctx, makeReq({ query: { user: 'test.user@wsd.com' } }));
  assert.equal(ctx.res.status, 502);
  assert.equal(ctx.res.body.error.code, 'JIRA_UPSTREAM_ERROR');
  restore();
});

test('missing JIRA_TOKEN returns 500 CONFIG_MISSING', async () => {
  delete process.env.JIRA_TOKEN;
  stubAuthValid();
  const ctx = makeContext();
  await jira(ctx, makeReq({ query: { user: 'test.user@wsd.com' } }));
  assert.equal(ctx.res.status, 500);
  assert.equal(ctx.res.body.error.code, 'CONFIG_MISSING');
  restore();
});

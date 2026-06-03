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
  await jira(ctx, makeReq());
  assert.equal(ctx.res.status, 200);
  assert.equal(ctx.res.body.issues.length, 1);
  assert.equal(ctx.res.body.error, null);
  restore();
});

test('caller-supplied ?user is ignored — queries the token identity, not the param', async () => {
  withToken();
  stubAuthValid({ preferred_username: 'test.user@wsd.com' });
  let capturedUrl = '';
  http.setRequestJson(async (url) => { capturedUrl = url; return { issues: [], total: 0 }; });
  const ctx = makeContext();
  // Attempt to enumerate someone else's tickets via the query param.
  await jira(ctx, makeReq({ query: { user: 'cfo@wsd.com' } }));
  assert.equal(ctx.res.status, 200);
  const jql = decodeURIComponent(capturedUrl);
  assert.ok(jql.includes('test.user@wsd.com'), 'JQL must use the token identity');
  assert.ok(!jql.includes('cfo@wsd.com'), 'JQL must not use the caller-supplied param');
  assert.equal(ctx.res.body.queryUser, 'test.user@wsd.com');
  restore();
});

test('malicious identity on the token is rejected with 400', async () => {
  withToken();
  stubAuthValid({ preferred_username: 'evil" OR 1=1' });
  const ctx = makeContext();
  await jira(ctx, makeReq());
  assert.equal(ctx.res.status, 400);
  assert.equal(ctx.res.body.error.code, 'FIELD_VALIDATION_FAILED');
  restore();
});

test('token without an email identity returns 403', async () => {
  withToken();
  stubAuthValid({ preferred_username: undefined, upn: undefined, email: undefined });
  const ctx = makeContext();
  await jira(ctx, makeReq());
  assert.equal(ctx.res.status, 403);
  assert.equal(ctx.res.body.error.code, 'NO_CALLER_IDENTITY');
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
  await jira(ctx, makeReq());
  assert.equal(ctx.res.status, 401);
  restore();
});

test('upstream 401 maps to 502 JIRA_AUTH_FAILED', async () => {
  withToken();
  stubAuthValid();
  http.setRequestJson(async () => { const e = new Error('x'); e.statusCode = 401; throw e; });
  const ctx = makeContext();
  await jira(ctx, makeReq());
  assert.equal(ctx.res.status, 502);
  assert.equal(ctx.res.body.error.code, 'JIRA_AUTH_FAILED');
  restore();
});

test('upstream non-JSON/other error maps to 502 JIRA_UPSTREAM_ERROR', async () => {
  withToken();
  stubAuthValid();
  http.setRequestJson(async () => { const e = new Error('Invalid JSON'); e.statusCode = 500; throw e; });
  const ctx = makeContext();
  await jira(ctx, makeReq());
  assert.equal(ctx.res.status, 502);
  assert.equal(ctx.res.body.error.code, 'JIRA_UPSTREAM_ERROR');
  restore();
});

test('missing JIRA_TOKEN returns 500 CONFIG_MISSING', async () => {
  delete process.env.JIRA_TOKEN;
  stubAuthValid();
  const ctx = makeContext();
  await jira(ctx, makeReq());
  assert.equal(ctx.res.status, 500);
  assert.equal(ctx.res.body.error.code, 'CONFIG_MISSING');
  restore();
});

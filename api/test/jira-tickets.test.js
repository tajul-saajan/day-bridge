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

// The function makes up to two upstream calls: (1) /user/search to resolve the
// accountId, then (2) /search/jql for the tickets. This helper routes the stub.
function stubJira({ users = [], issues = [], total = issues.length } = {}) {
  http.setRequestJson(async (url) => {
    if (url.includes('/user/search')) return users;
    return { issues, total };
  });
}

test('happy path returns 200 with issues', async () => {
  withToken();
  stubAuthValid();
  stubJira({ users: [{ accountId: 'aid-1', emailAddress: 'test.user@wsd.com' }], issues: [{ key: 'DW-1' }] });
  const ctx = makeContext();
  await jira(ctx, makeReq({ query: { user: 'test.user@wsd.com' } }));
  assert.equal(ctx.res.status, 200);
  assert.equal(ctx.res.body.issues.length, 1);
  assert.equal(ctx.res.body.error, null);
  restore();
});

test('resolves accountId, queries active tickets + Done-today count by it', async () => {
  withToken();
  stubAuthValid();
  const urls = [];
  http.setRequestJson(async (url) => {
    if (url.includes('/user/search')) return [{ accountId: 'aid-42', emailAddress: 'test.user@wsd.com' }];
    urls.push(decodeURIComponent(url));
    return { issues: [], total: 0 };
  });
  const ctx = makeContext();
  await jira(ctx, makeReq({ query: { user: 'test.user@wsd.com' } }));
  const openJql = urls.find(u => u.includes('statusCategory != Done'));
  const doneJql = urls.find(u => u.includes('statusCategory = Done'));
  assert.ok(openJql, 'fires the active-tickets query (statusCategory != Done)');
  assert.ok(openJql.includes('assignee = "aid-42"'), 'queries by resolved accountId');
  assert.ok(openJql.includes('maxResults=50'), 'raised result cap');
  assert.ok(doneJql, 'fires the Done-today count query');
  assert.ok(doneJql.includes('resolved >= startOfDay()'), 'Done-today scoped to today');
  restore();
});

test('falls back to the email when accountId lookup returns nothing', async () => {
  withToken();
  stubAuthValid();
  let jqlUrl = '';
  http.setRequestJson(async (url) => {
    if (url.includes('/user/search')) return [];
    jqlUrl = url;
    return { issues: [], total: 0 };
  });
  const ctx = makeContext();
  await jira(ctx, makeReq({ query: { user: 'test.user@wsd.com' } }));
  assert.ok(decodeURIComponent(jqlUrl).includes('assignee = "test.user@wsd.com"'));
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

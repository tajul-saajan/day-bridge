const { test } = require('node:test');
const assert = require('node:assert/strict');

const health = require('../health');
const { makeContext, makeReq } = require('./helpers');

const ORIG = { jira: process.env.JIRA_TOKEN, claude: process.env.CLAUDE_API_KEY };
function restore() {
  if (ORIG.jira === undefined) delete process.env.JIRA_TOKEN; else process.env.JIRA_TOKEN = ORIG.jira;
  if (ORIG.claude === undefined) delete process.env.CLAUDE_API_KEY; else process.env.CLAUDE_API_KEY = ORIG.claude;
}

test('all config present returns 200 pass', async () => {
  process.env.JIRA_TOKEN = 'x';
  process.env.CLAUDE_API_KEY = 'y';
  const ctx = makeContext();
  await health(ctx, makeReq());
  assert.equal(ctx.res.status, 200);
  assert.equal(ctx.res.body.status, 'pass');
  restore();
});

test('missing critical config returns 503 fail', async () => {
  delete process.env.JIRA_TOKEN;
  process.env.CLAUDE_API_KEY = 'y';
  const ctx = makeContext();
  await health(ctx, makeReq());
  assert.equal(ctx.res.status, 503);
  assert.equal(ctx.res.body.status, 'fail');
  assert.equal(ctx.res.body.checks.jira.status, 'fail');
  restore();
});

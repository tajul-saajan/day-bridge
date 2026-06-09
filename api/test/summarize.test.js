const { test } = require('node:test');
const assert = require('node:assert/strict');

const summarize = require('../summarize');
const { setFactory } = require('../shared/anthropic');
const {
  stubAuthValid, stubAuthInvalid, stubAnthropic, stubAnthropicThrows,
  makeContext, makeReq,
} = require('./helpers');

const ORIG_KEY = process.env.CLAUDE_API_KEY;
function withKey() { process.env.CLAUDE_API_KEY = 'sk-test'; }
function restore() {
  if (ORIG_KEY === undefined) delete process.env.CLAUDE_API_KEY;
  else process.env.CLAUDE_API_KEY = ORIG_KEY;
  setFactory(null);
}

const VALID_REPLY = JSON.stringify({ summary: 'hi', focusOrder: ['a'], blockers: [] });
const body = { tasks: [{ key: 'DW-1' }], emails: [] };

test('happy path returns 200 with parsed JSON', async () => {
  withKey();
  stubAuthValid();
  stubAnthropic(VALID_REPLY);
  const ctx = makeContext();
  await summarize(ctx, makeReq({ method: 'POST', body }));
  assert.equal(ctx.res.status, 200);
  assert.equal(ctx.res.body.summary, 'hi');
  restore();
});

test('parses fenced ```json reply', async () => {
  withKey();
  stubAuthValid();
  stubAnthropic('```json\n' + VALID_REPLY + '\n```');
  const ctx = makeContext();
  await summarize(ctx, makeReq({ method: 'POST', body }));
  assert.equal(ctx.res.status, 200);
  restore();
});

test('non-POST returns 405', async () => {
  withKey();
  stubAuthValid();
  const ctx = makeContext();
  await summarize(ctx, makeReq({ method: 'GET', body }));
  assert.equal(ctx.res.status, 405);
  assert.equal(ctx.res.body.error.code, 'METHOD_NOT_ALLOWED');
  restore();
});

test('missing body returns 400', async () => {
  withKey();
  stubAuthValid();
  const ctx = makeContext();
  await summarize(ctx, makeReq({ method: 'POST', body: {} }));
  assert.equal(ctx.res.status, 400);
  assert.equal(ctx.res.body.error.code, 'FIELD_VALIDATION_FAILED');
  restore();
});

test('missing CLAUDE_API_KEY returns 500', async () => {
  delete process.env.CLAUDE_API_KEY;
  stubAuthValid();
  const ctx = makeContext();
  await summarize(ctx, makeReq({ method: 'POST', body }));
  assert.equal(ctx.res.status, 500);
  assert.equal(ctx.res.body.error.code, 'CONFIG_MISSING');
  restore();
});

test('upstream error returns 502 AI_UPSTREAM_ERROR', async () => {
  withKey();
  stubAuthValid();
  stubAnthropicThrows();
  const ctx = makeContext();
  await summarize(ctx, makeReq({ method: 'POST', body }));
  assert.equal(ctx.res.status, 502);
  assert.equal(ctx.res.body.error.code, 'AI_UPSTREAM_ERROR');
  restore();
});

test('malformed model JSON returns 502 AI_BAD_RESPONSE', async () => {
  withKey();
  stubAuthValid();
  stubAnthropic('not json at all');
  const ctx = makeContext();
  await summarize(ctx, makeReq({ method: 'POST', body }));
  assert.equal(ctx.res.status, 502);
  assert.equal(ctx.res.body.error.code, 'AI_BAD_RESPONSE');
  restore();
});

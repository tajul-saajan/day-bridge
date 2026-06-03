const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parseTraceparent, childHeaders, TRACEPARENT_RE } = require('../shared/trace');
const { problem } = require('../shared/http');
const { requireAuth, bearerToken } = require('../shared/auth');
const { makeContext, makeReq, stubAuthValid, stubAuthInvalid } = require('./helpers');

test('trace: generates a valid traceparent when absent', () => {
  const t = parseTraceparent({ headers: {} });
  assert.match(t.traceparent, TRACEPARENT_RE);
  assert.equal(t.traceId.length, 32);
});

test('trace: preserves a valid inbound traceparent', () => {
  const tp = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
  const t = parseTraceparent({ headers: { traceparent: tp } });
  assert.equal(t.traceparent, tp);
  assert.equal(t.traceId, '0af7651916cd43dd8448eb211c80319c');
});

test('trace: childHeaders keeps the trace id, new span id', () => {
  const h = childHeaders({ traceId: '0af7651916cd43dd8448eb211c80319c' });
  assert.match(h.traceparent, TRACEPARENT_RE);
  assert.ok(h.traceparent.includes('0af7651916cd43dd8448eb211c80319c'));
});

test('http: problem() writes an RFC 9457 envelope', () => {
  const ctx = makeContext();
  problem(ctx, { status: 400, type: 'validation', code: 'X', message: 'bad' });
  assert.equal(ctx.res.status, 400);
  assert.equal(ctx.res.headers['Content-Type'], 'application/problem+json');
  assert.equal(ctx.res.body.error.type, 'validation');
  assert.ok(ctx.res.body.error.timestamp);
});

test('http: unknown type falls back to server', () => {
  const ctx = makeContext();
  problem(ctx, { status: 500, type: 'nonsense', code: 'X', message: 'y' });
  assert.equal(ctx.res.body.error.type, 'server');
});

test('auth: bearerToken extracts the token', () => {
  assert.equal(bearerToken({ headers: { authorization: 'Bearer abc' } }), 'abc');
  assert.equal(bearerToken({ headers: {} }), null);
});

test('auth: requireAuth rejects when no token', async () => {
  const ctx = makeContext();
  const r = await requireAuth(ctx, makeReq({ auth: false }), null);
  assert.equal(r, null);
  assert.equal(ctx.res.status, 401);
});

test('auth: requireAuth passes a valid token', async () => {
  stubAuthValid();
  const ctx = makeContext();
  const r = await requireAuth(ctx, makeReq(), null);
  assert.ok(r);
  assert.equal(r.email, 'test.user@wsd.com');
});

test('auth: requireAuth rejects an invalid token', async () => {
  stubAuthInvalid();
  const ctx = makeContext();
  const r = await requireAuth(ctx, makeReq(), null);
  assert.equal(r, null);
  assert.equal(ctx.res.status, 401);
});

// Default verifier path: a forwarded Graph token is validated by calling Graph
// /me (stubbed here via the shared http layer), NOT by JWKS signature checks.
const { setVerifier } = require('../shared/auth');
const http = require('../shared/http');

test('auth: default verifier authenticates via Graph /me', async () => {
  setVerifier(null); // use the real defaultVerify (Graph-backed)
  http.setRequestJson(async (url) => {
    assert.ok(url.startsWith('https://graph.microsoft.com/v1.0/me'));
    return { id: 'oid-123', mail: 'real.user@wsd.com', displayName: 'Real User' };
  });
  const ctx = makeContext();
  const r = await requireAuth(ctx, makeReq(), null);
  assert.ok(r);
  assert.equal(r.userId, 'oid-123');
  assert.equal(r.email, 'real.user@wsd.com');
  http.setRequestJson(null);
  setVerifier(null);
});

test('auth: default verifier rejects when Graph /me fails (bad token)', async () => {
  setVerifier(null);
  http.setRequestJson(async () => { const e = new Error('x'); e.statusCode = 401; throw e; });
  const ctx = makeContext();
  const r = await requireAuth(ctx, makeReq(), null);
  assert.equal(r, null);
  assert.equal(ctx.res.status, 401);
  http.setRequestJson(null);
  setVerifier(null);
});

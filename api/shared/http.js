// HTTP helpers: RFC 9457 error envelopes (WSD-011) and a safe outbound JSON
// request that checks the upstream status code.

const https = require('https');

// Baseline RFC 9457 `type` values from WSD-011.
const TYPES = ['validation', 'authentication', 'authorisation', 'not-found', 'conflict', 'rate-limit', 'server'];

// Write an RFC 9457 problem response onto context.res.
function problem(context, { status, type, code, message, params, details, headers } = {}) {
  const safeType = TYPES.includes(type) ? type : 'server';
  context.res = {
    status: status || 500,
    headers: { 'Content-Type': 'application/problem+json', ...(headers || {}) },
    body: {
      error: {
        type:      safeType,
        code:      code || 'INTERNAL_ERROR',
        message:   message || 'An unexpected error occurred.',
        timestamp: new Date().toISOString(),
        params:    params  || {},
        details:   details || [],
      },
    },
  };
}

// Promisified request that rejects on non-2xx and on invalid JSON. Errors carry
// statusCode and a truncated, secret-free snippet of the upstream body.
// Indirected through `_impl` so tests can stub the network via setRequestJson().
function requestJson(...args) {
  return _impl(...args);
}

function realRequestJson(url, { method = 'GET', headers = {}, body = null, traceHeaders = {} } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body));
    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || 443,
      path:     parsed.pathname + parsed.search,
      method,
      headers: {
        ...headers,
        ...traceHeaders,
        ...(payload != null ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = https.request(options, res => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        const status = res.statusCode || 0;
        if (status < 200 || status >= 300) {
          const err = new Error(`Upstream responded ${status}`);
          err.statusCode = status;
          err.snippet = String(raw).slice(0, 200);
          return reject(err);
        }
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch {
          const err = new Error('Invalid JSON from upstream');
          err.statusCode = status;
          reject(err);
        }
      });
    });
    req.on('error', reject);
    if (payload != null) req.write(payload);
    req.end();
  });
}

let _impl = realRequestJson;
function setRequestJson(fn) { _impl = fn || realRequestJson; }

module.exports = { problem, requestJson, setRequestJson, TYPES };

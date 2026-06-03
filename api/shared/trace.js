// W3C Trace Context (WSD-011 §Request Tracing).
// Generate trace IDs with a cryptographically secure PRNG; never seed from
// user-identifiable data.

const crypto = require('crypto');

const TRACEPARENT_RE = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;

// Read an inbound traceparent or generate a fresh one. Returns the traceparent
// string plus the extracted traceId/spanId for logging and propagation.
function parseTraceparent(req) {
  const headers = (req && req.headers) || {};
  const incoming = headers['traceparent'] || headers['Traceparent'];
  const tracestate = headers['tracestate'] || headers['Tracestate'] || null;

  if (typeof incoming === 'string' && TRACEPARENT_RE.test(incoming.trim())) {
    const [, traceId, spanId] = incoming.trim().split('-');
    return { traceparent: incoming.trim(), traceId, spanId, tracestate };
  }

  const traceId = crypto.randomBytes(16).toString('hex');
  const spanId  = crypto.randomBytes(8).toString('hex');
  return { traceparent: `00-${traceId}-${spanId}-01`, traceId, spanId, tracestate };
}

// Headers to attach to an outbound call so the trace propagates downstream.
function childHeaders({ traceId, tracestate } = {}) {
  if (!traceId) return {};
  const childSpan = crypto.randomBytes(8).toString('hex');
  const headers = { traceparent: `00-${traceId}-${childSpan}-01` };
  if (tracestate) headers.tracestate = tracestate;
  return headers;
}

module.exports = { parseTraceparent, childHeaders, TRACEPARENT_RE };

// Bearer-token authentication gate (see README "API auth audience caveat").
//
// The SPA authenticates with MSAL against Azure AD and forwards its access
// token as `Authorization: Bearer <token>`. We validate the JWT signature
// against the tenant's AAD JWKS and check issuer/tenant/expiry. This is a real
// gate against anonymous internet callers. The token's audience is Microsoft
// Graph (not a dedicated DayBridge API) — registering an app API scope is the
// proper long-term fix; documented as a known caveat.

const { problem } = require('./http');

const TENANT_ID = process.env.AAD_TENANT_ID || 'a3be1280-7a3a-4edc-b258-0d6a539beee9';

// Allowed issuers for the tenant (v1.0 and v2.0 endpoints).
const ISSUERS = [
  `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
  `https://sts.windows.net/${TENANT_ID}/`,
];

// Lazily-created JWKS so cold starts don't pay for it until first auth.
let _jwks = null;
function getJwks() {
  if (!_jwks) {
    const { createRemoteJWKSet } = require('jose');
    _jwks = createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`)
    );
  }
  return _jwks;
}

// Default verifier — overridable in tests via setVerifier().
async function defaultVerify(token) {
  const { jwtVerify } = require('jose');
  const { payload } = await jwtVerify(token, getJwks(), { issuer: ISSUERS });
  return payload;
}

let _verify = defaultVerify;
function setVerifier(fn) { _verify = fn || defaultVerify; }

function bearerToken(req) {
  const h = (req && req.headers) || {};
  const raw = h['authorization'] || h['Authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return m ? m[1].trim() : null;
}

// Validate the caller. On success returns { token, payload, userId, email }.
// On failure writes a 401 RFC 9457 problem and returns null (caller returns).
async function requireAuth(context, req, log) {
  const token = bearerToken(req);
  if (!token) {
    if (log) log.warn('Unauthenticated request — no bearer token');
    problem(context, { status: 401, type: 'authentication', code: 'AUTH_REQUIRED', message: 'Authentication required.' });
    return null;
  }
  try {
    const payload = await _verify(token);
    if (payload.tid && payload.tid !== TENANT_ID) {
      throw new Error('Token from a different tenant');
    }
    return {
      token,
      payload,
      userId: payload.oid || payload.sub || null,
      email:  payload.preferred_username || payload.upn || payload.email || null,
    };
  } catch (err) {
    if (log) log.warn('Token validation failed', { reason: err.message });
    problem(context, { status: 401, type: 'authentication', code: 'AUTH_INVALID', message: 'Invalid or expired token.' });
    return null;
  }
}

module.exports = { requireAuth, bearerToken, setVerifier, TENANT_ID, ISSUERS };

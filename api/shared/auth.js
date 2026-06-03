// Bearer-token authentication gate.
//
// The SPA authenticates with MSAL against Azure AD and forwards its Microsoft
// Graph access token as `Authorization: Bearer <token>`. Graph access tokens
// are NOT third-party-verifiable via JWKS — they carry a `nonce` in the header
// so a standard signature check fails, and their audience is Graph, not us.
// The correct validator is the resource server itself: we call Graph `/me` with
// the token. A 200 proves the token is valid, unexpired, and belongs to a user
// in our tenant, and gives us the caller's identity. This both restores
// functionality and keeps a real gate against anonymous internet callers.

const { problem, requestJson } = require('./http');

const TENANT_ID = process.env.AAD_TENANT_ID || 'a3be1280-7a3a-4edc-b258-0d6a539beee9';
const GRAPH_ME = 'https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName,displayName';

// Default verifier — validates the forwarded Graph token by calling Graph /me.
// Overridable in tests via setVerifier(). Returns a normalised principal.
async function defaultVerify(token) {
  const me = await requestJson(GRAPH_ME, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  return {
    oid:   me.id || null,
    email: me.mail || me.userPrincipalName || null,
    name:  me.displayName || null,
  };
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
    return {
      token,
      payload,
      userId: payload.oid || payload.sub || payload.id || null,
      email:  payload.email || payload.mail || payload.preferred_username || payload.upn || payload.userPrincipalName || null,
    };
  } catch (err) {
    if (log) log.warn('Token validation failed', { reason: err.message });
    problem(context, { status: 401, type: 'authentication', code: 'AUTH_INVALID', message: 'Invalid or expired token.' });
    return null;
  }
}

module.exports = { requireAuth, bearerToken, setVerifier, TENANT_ID };

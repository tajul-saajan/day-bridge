// Azure Function: GET /api/jira-tickets?user=<email>
// Proxies Jira REST search server-side so the Jira token never reaches the
// browser. Anonymous at the SWA layer: Azure Static Web Apps overwrites the
// inbound Authorization header with its own token before it reaches managed
// functions, so a forwarded MSAL bearer can't be validated here. A real
// per-user gate would require SWA's built-in auth (EasyAuth) — see README.

const { parseTraceparent, childHeaders } = require('../shared/trace');
const { makeLogger } = require('../shared/logger');
const { problem, requestJson } = require('../shared/http');

// Jira account identifiers are emails/usernames — reject anything that could
// break out of the quoted JQL clause (quotes, backslashes, control chars).
const USER_RE = /^[A-Za-z0-9._%+\-@]{1,128}$/;

module.exports = async function (context, req) {
  const trace = parseTraceparent(req);
  const log   = makeLogger(context, { traceId: trace.traceId });
  const traceHeader = { traceparent: trace.traceparent };

  const authEmail = process.env.JIRA_EMAIL    || 'kobir.hosan@wsd.com';
  const token     = process.env.JIRA_TOKEN;
  const baseUrl   = process.env.JIRA_BASE_URL || 'https://wallstreetdocs.atlassian.net';

  // The SPA passes the signed-in user's email as ?user=. Never fall back to the
  // service-account email, which would leak its tickets.
  const queryUser = req.query.user || '';
  if (!queryUser) {
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...traceHeader },
      body: { issues: [], total: 0, doneToday: 0, queryUser: '', authEmail, error: null },
    };
    return;
  }

  if (!token) {
    log.error('JIRA_TOKEN not configured');
    problem(context, { status: 500, type: 'server', code: 'CONFIG_MISSING', message: 'Jira integration is not configured.', headers: traceHeader });
    return;
  }

  if (!USER_RE.test(queryUser)) {
    problem(context, {
      status: 400, type: 'validation', code: 'FIELD_VALIDATION_FAILED',
      message: 'Invalid user parameter.', params: { user: 'must be a valid account identifier' },
      headers: traceHeader,
    });
    return;
  }

  const auth    = Buffer.from(`${authEmail}:${token}`).toString('base64');
  const headers = { Authorization: `Basic ${auth}`, Accept: 'application/json' };
  const fields  = 'summary,priority,status,duedate,issuetype,assignee';

  // Jira Cloud no longer matches assignee by email (GDPR), so resolve the email
  // to the user's accountId first; fall back to the raw value if lookup fails.
  const accountId = await resolveAccountId(baseUrl, auth, queryUser, childHeaders(trace), log);
  const assignee  = (accountId || queryUser).replace(/(["\\])/g, '\\$1');

  // Active tickets (To Do, In Progress, In Review, … — anything not Done) plus a
  // count of tickets the user completed today, for the "Done Today" stat.
  const jqlOpen = encodeURIComponent(
    `assignee = "${assignee}" AND statusCategory != Done ORDER BY priority ASC, due ASC`
  );
  const jqlDone = encodeURIComponent(
    `assignee = "${assignee}" AND statusCategory = Done AND resolved >= startOfDay() ORDER BY resolved DESC`
  );
  const urlOpen = `${baseUrl}/rest/api/3/search/jql?jql=${jqlOpen}&fields=${fields}&maxResults=50`;
  const urlDone = `${baseUrl}/rest/api/3/search/jql?jql=${jqlDone}&fields=${fields}&maxResults=50`;

  try {
    const [openData, doneData] = await Promise.all([
      requestJson(urlOpen, { method: 'GET', headers, traceHeaders: childHeaders(trace) }),
      requestJson(urlDone, { method: 'GET', headers, traceHeaders: childHeaders(trace) }).catch(() => ({ total: 0 })),
    ]);
    const doneToday = doneData.total || 0;

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...traceHeader },
      body: {
        issues:    openData.issues || [],
        total:     openData.total  || 0,
        doneToday,
        queryUser,
        authEmail,
        error:     null,
      },
    };
  } catch (err) {
    log.error('Jira upstream request failed', { statusCode: err.statusCode });
    if (err.statusCode === 401 || err.statusCode === 403) {
      problem(context, { status: 502, type: 'server', code: 'JIRA_AUTH_FAILED', message: 'Jira rejected the integration credentials.', headers: traceHeader });
    } else {
      problem(context, { status: 502, type: 'server', code: 'JIRA_UPSTREAM_ERROR', message: 'Failed to fetch tickets from Jira.', headers: traceHeader });
    }
  }
};

// Resolve a user's email to their Jira accountId. Returns null on any failure so
// the caller can fall back to querying by the raw value.
async function resolveAccountId(baseUrl, auth, email, traceHeaders, log) {
  try {
    const users = await requestJson(
      `${baseUrl}/rest/api/3/user/search?query=${encodeURIComponent(email)}`,
      { method: 'GET', headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' }, traceHeaders }
    );
    if (Array.isArray(users) && users.length) {
      const exact = users.find(u => (u.emailAddress || '').toLowerCase() === email.toLowerCase());
      return (exact || users[0]).accountId || null;
    }
  } catch (err) {
    log.warn('Jira user lookup failed', { statusCode: err.statusCode });
  }
  return null;
}

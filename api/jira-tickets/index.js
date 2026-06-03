// Azure Function: GET /api/jira-tickets?user=<email>
// Proxies Jira REST search server-side so the Jira token never reaches the
// browser. Requires an authenticated caller (bearer token).

const { parseTraceparent, childHeaders } = require('../shared/trace');
const { makeLogger } = require('../shared/logger');
const { problem, requestJson } = require('../shared/http');
const { requireAuth } = require('../shared/auth');

// Jira account identifiers are emails/usernames — reject anything that could
// break out of the quoted JQL clause (quotes, backslashes, control chars).
const USER_RE = /^[A-Za-z0-9._%+\-@]{1,128}$/;

module.exports = async function (context, req) {
  const trace = parseTraceparent(req);
  const log   = makeLogger(context, { traceId: trace.traceId });
  const traceHeader = { traceparent: trace.traceparent };

  const principal = await requireAuth(context, req, log);
  if (!principal) return;

  const authEmail = process.env.JIRA_EMAIL    || 'kobir.hosan@wsd.com';
  const token     = process.env.JIRA_TOKEN;
  const baseUrl   = process.env.JIRA_BASE_URL || 'https://wallstreetdocs.atlassian.net';

  // Default to the authenticated caller's own email when no user param given.
  const queryUser = req.query.user || principal.email || authEmail;

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

  const auth = Buffer.from(`${authEmail}:${token}`).toString('base64');
  // queryUser is already strictly validated; escape defensively as belt-and-braces.
  const safeUser = queryUser.replace(/(["\\])/g, '\\$1');
  const jql  = encodeURIComponent(
    `assignee = "${safeUser}" AND statusCategory != Done ORDER BY priority ASC, due ASC`
  );
  const fields = 'summary,priority,status,duedate,issuetype,assignee';
  const url    = `${baseUrl}/rest/api/3/search/jql?jql=${jql}&fields=${fields}&maxResults=20`;

  try {
    const data = await requestJson(url, {
      method: 'GET',
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
      traceHeaders: childHeaders(trace),
    });

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...traceHeader },
      body: {
        issues:    data.issues || [],
        total:     data.total  || 0,
        queryUser,
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

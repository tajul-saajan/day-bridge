const https = require('https');

module.exports = async function (context, req) {
  const authEmail = process.env.JIRA_EMAIL    || 'kobir.hosan@wsd.com';
  const token     = process.env.JIRA_TOKEN;
  const baseUrl   = process.env.JIRA_BASE_URL || 'https://wallstreetdocs.atlassian.net';
  const queryUser = req.query.user || '';

  // Require an explicit user param — never silently fall back to the service-account email
  if (!queryUser) {
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { issues: [], total: 0, doneToday: 0, queryUser: '', authEmail, error: null },
    };
    return;
  }

  if (!token) {
    context.res = {
      status: 500,
      body: { error: 'JIRA_TOKEN not configured', queryUser, issues: [] },
    };
    return;
  }

  const auth   = Buffer.from(`${authEmail}:${token}`).toString('base64');
  const headers = { Authorization: `Basic ${auth}`, Accept: 'application/json' };
  const fields  = 'summary,priority,status,duedate,issuetype,assignee';

  const jqlOpen = encodeURIComponent(
    `assignee = "${queryUser}" AND statusCategory != Done ORDER BY priority ASC, due ASC`
  );
  // Use only statusCategory = Done — avoids silent 400 errors when specific status names
  // don't exist in this Jira instance (httpGet resolves 400s, so errorMessages silences total)
  const jqlDone = encodeURIComponent(
    `assignee = "${queryUser}" AND statusCategory = Done AND updated >= startOfDay() ORDER BY updated DESC`
  );

  const urlOpen = `${baseUrl}/rest/api/3/search/jql?jql=${jqlOpen}&fields=${fields}&maxResults=20`;
  const urlDone = `${baseUrl}/rest/api/3/search/jql?jql=${jqlDone}&fields=${fields}&maxResults=50`;

  try {
    const [openData, doneData] = await Promise.all([
      httpGet(urlOpen, headers),
      httpGet(urlDone, headers).catch(err => ({ total: 0, _err: err.message })),
    ]);

    // doneData may be a Jira error object (no total) if JQL was invalid
    const doneToday  = doneData.errorMessages?.length ? 0 : (doneData.total || 0);
    const doneError  = doneData.errorMessages?.[0] || doneData._err || null;

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        issues:    openData.issues || [],
        total:     openData.total  || 0,
        doneToday,
        queryUser,
        authEmail,
        error:     openData.errorMessages?.[0] || null,
        doneError,
      },
    };
  } catch (err) {
    context.res = {
      status: 500,
      body: { error: err.message, queryUser, authEmail, issues: [], doneToday: 0 },
    };
  }
};

function httpGet(url, headers) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path:     parsed.pathname + parsed.search,
      method:   'GET',
      headers,
    };
    const req = https.request(options, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error('Invalid JSON from Jira')); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

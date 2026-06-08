const https = require('https');

module.exports = async function (context, req) {
  const authEmail = process.env.JIRA_EMAIL    || 'kobir.hosan@wsd.com';
  const token     = process.env.JIRA_TOKEN;
  const baseUrl   = process.env.JIRA_BASE_URL || 'https://wallstreetdocs.atlassian.net';
  const queryUser = req.query.user || authEmail;

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
  const jqlDone = encodeURIComponent(
    `assignee = "${queryUser}" AND (statusCategory = Done OR status in ("Fulfilled","Closed","Resolved","Done","Complete","Completed")) AND updated >= startOfDay() ORDER BY updated DESC`
  );

  const urlOpen = `${baseUrl}/rest/api/3/search/jql?jql=${jqlOpen}&fields=${fields}&maxResults=20`;
  const urlDone = `${baseUrl}/rest/api/3/search/jql?jql=${jqlDone}&fields=${fields}&maxResults=50`;

  try {
    const [openData, doneData] = await Promise.all([
      httpGet(urlOpen, headers),
      httpGet(urlDone, headers).catch(() => ({ total: 0 })),
    ]);

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        issues:    openData.issues || [],
        total:     openData.total  || 0,
        doneToday: doneData.total  || 0,
        queryUser,
        authEmail,
        error:     openData.errorMessages?.[0] || null,
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

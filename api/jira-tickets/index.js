const https = require('https');

module.exports = async function (context, req) {
  const email     = process.env.JIRA_EMAIL    || 'kobir.hosan@wsd.com';
  const token     = process.env.JIRA_TOKEN;
  const baseUrl   = process.env.JIRA_BASE_URL || 'https://wallstreetdocs.atlassian.net';
  const jiraUser  = req.query.user;

  if (!token) {
    context.res = { status: 500, body: { error: 'JIRA_TOKEN not configured' } };
    return;
  }

  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  const assignee = jiraUser ? `assignee = "${jiraUser}"` : 'assignee = currentUser()';
  const jql = encodeURIComponent(
    `${assignee} AND statusCategory != Done ORDER BY priority ASC, due ASC`
  );
  const fields = 'summary,priority,status,duedate,issuetype,assignee';
  const url = `${baseUrl}/rest/api/3/search?jql=${jql}&fields=${fields}&maxResults=20`;

  try {
    const data = await httpGet(url, {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
    });
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: data,
    };
  } catch (err) {
    context.res = { status: 500, body: { error: err.message } };
  }
};

function httpGet(url, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
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

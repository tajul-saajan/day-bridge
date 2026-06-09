const https = require('https');

module.exports = async function (context, req) {
  const apiKey  = process.env.BAMBOOHR_API_KEY;
  const company = process.env.BAMBOOHR_COMPANY_DOMAIN;

  if (!apiKey || !company) {
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { whosOut: [], error: 'BambooHR not configured', configured: false },
    };
    return;
  }

  // Date range: today only
  const today = new Date().toISOString().split('T')[0];
  const auth  = Buffer.from(`${apiKey}:x`).toString('base64');

  try {
    // Who's out today
    const whosOut = await httpGet(
      `https://api.bamboohr.com/api/gateway.php/${company}/v1/time_off/whos_out/?start=${today}&end=${today}`,
      { Authorization: `Basic ${auth}`, Accept: 'application/json' }
    );

    // Upcoming time off for current user (optional — pass ?employeeId=xxx)
    const employeeId = req.query.employeeId;
    let upcoming = [];
    if (employeeId) {
      const future = new Date();
      future.setDate(future.getDate() + 30);
      const futureStr = future.toISOString().split('T')[0];
      try {
        const requests = await httpGet(
          `https://api.bamboohr.com/api/gateway.php/${company}/v1/employees/${employeeId}/time_off/requests?start=${today}&end=${futureStr}&status=approved`,
          { Authorization: `Basic ${auth}`, Accept: 'application/json' }
        );
        upcoming = Array.isArray(requests) ? requests : [];
      } catch { /* optional — skip if fails */ }
    }

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        whosOut:    Array.isArray(whosOut) ? whosOut : [],
        upcoming,
        today,
        configured: true,
        error:      null,
      },
    };
  } catch (err) {
    context.res = {
      status: 500,
      body: { whosOut: [], upcoming: [], error: err.message, configured: true },
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
        catch { reject(new Error(`BambooHR parse error: ${body.slice(0, 100)}`)); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

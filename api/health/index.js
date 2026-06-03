// Azure Function: GET /api/health (WSD-011/012).
// Reports presence-only checks for required configuration — never the values.
// status: pass | warn | fail; HTTP 2xx for pass/warn, 503 for fail.
// NOTE (deviation): SWA managed functions have no private network, so this
// cannot be restricted to internal traffic as WSD-011 prefers. It returns only
// non-sensitive booleans. See README "Standards Compliance & Deviations".

const { parseTraceparent } = require('../shared/trace');
const { makeLogger } = require('../shared/logger');

function serviceVersion() {
  return process.env.RELEASE_VERSION || process.env.GIT_HASH || 'dev';
}

module.exports = async function (context, req) {
  const trace = parseTraceparent(req);
  const log   = makeLogger(context, { traceId: trace.traceId });

  const checks = {
    jira:   { status: process.env.JIRA_TOKEN     ? 'pass' : 'fail' },
    claude: { status: process.env.CLAUDE_API_KEY ? 'pass' : 'fail' },
  };

  const anyFail = Object.values(checks).some(c => c.status === 'fail');
  const status  = anyFail ? 'fail' : 'pass';

  if (anyFail) log.error('Health check failing — missing configuration', { checks });

  context.res = {
    status: anyFail ? 503 : 200,
    headers: { 'Content-Type': 'application/json', traceparent: trace.traceparent },
    body: { status, version: serviceVersion(), checks },
  };
};

// Azure Function: POST /api/summarize
// Sends the caller's open tasks and unread emails to Claude and returns a
// concise daily briefing. Requires an authenticated caller (bearer token).
// Set CLAUDE_API_KEY in Azure Portal → Configuration. Model is overridable via
// CLAUDE_MODEL.

const { parseTraceparent, childHeaders } = require('../shared/trace');
const { makeLogger } = require('../shared/logger');
const { problem } = require('../shared/http');
const { requireAuth } = require('../shared/auth');
const { createClient } = require('../shared/anthropic');

const DEFAULT_MODEL = 'claude-sonnet-4-6';

module.exports = async function (context, req) {
  const trace = parseTraceparent(req);
  const log   = makeLogger(context, { traceId: trace.traceId });
  const traceHeader = { traceparent: trace.traceparent };

  if (req.method !== 'POST') {
    problem(context, { status: 405, type: 'validation', code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.', headers: traceHeader });
    return;
  }

  const principal = await requireAuth(context, req, log);
  if (!principal) return;

  const { tasks, emails, teams } = req.body || {};
  if (!tasks && !emails) {
    problem(context, { status: 400, type: 'validation', code: 'FIELD_VALIDATION_FAILED', message: 'tasks and emails are required.', params: { tasks: 'required', emails: 'required' }, headers: traceHeader });
    return;
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    log.error('CLAUDE_API_KEY not configured');
    problem(context, { status: 500, type: 'server', code: 'CONFIG_MISSING', message: 'AI summarisation is not configured.', headers: traceHeader });
    return;
  }

  const client = createClient(apiKey);

  const teamsSection = (teams && teams.length)
    ? `\nTeams Messages (sender and chat name only — do NOT reference message content):\n${JSON.stringify(teams, null, 2)}`
    : '';

  const prompt = `You are a productivity assistant. Given a user's open tasks, unread emails, and Teams activity, produce a concise daily briefing.

Open Tasks (Jira):
${JSON.stringify(tasks ?? [], null, 2)}

Unread Emails (top 5):
${JSON.stringify(emails ?? [], null, 2)}
${teamsSection}
Respond ONLY with valid JSON in this exact shape:
{
  "summary": "2-3 sentence briefing of the day's priorities. If there are Teams messages, mention who messaged but do not describe what they said.",
  "focusOrder": ["task or email description in recommended order", ...],
  "blockers": ["description of any blockers or urgent items", ...]
}`;

  let msg;
  try {
    msg = await client.messages.create({
      model:      process.env.CLAUDE_MODEL || DEFAULT_MODEL,
      max_tokens: 1024,
      messages:   [{ role: 'user', content: prompt }],
    }, { headers: childHeaders(trace) });
  } catch (err) {
    log.error('Anthropic request failed', { reason: err.message });
    problem(context, { status: 502, type: 'server', code: 'AI_UPSTREAM_ERROR', message: 'AI summarisation failed.', headers: traceHeader });
    return;
  }

  let json;
  try {
    const raw = msg.content[0].text.trim();
    json = JSON.parse(raw.replace(/^```json\n?/, '').replace(/\n?```$/, ''));
  } catch (err) {
    log.error('Anthropic returned unparseable output', { reason: err.message });
    problem(context, { status: 502, type: 'server', code: 'AI_BAD_RESPONSE', message: 'AI returned an unexpected response.', headers: traceHeader });
    return;
  }

  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...traceHeader },
    body: json,
  };
};

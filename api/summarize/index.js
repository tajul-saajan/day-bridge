// Azure Function: POST /api/summarize
// Deploy this folder as an Azure Function inside a Static Web App (managed functions).
// Set env var CLAUDE_API_KEY in Azure Portal → Configuration.

const Anthropic = require('@anthropic-ai/sdk');

module.exports = async function (context, req) {
  if (req.method !== 'POST') {
    context.res = { status: 405, body: 'Method Not Allowed' };
    return;
  }

  const { tasks, emails, teams } = req.body || {};
  if (!tasks && !emails) {
    context.res = { status: 400, body: { error: 'tasks and emails required' } };
    return;
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    context.res = { status: 500, body: { error: 'CLAUDE_API_KEY not configured' } };
    return;
  }

  const client = new Anthropic({ apiKey });

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

  try {
    const msg = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      messages:   [{ role: 'user', content: prompt }],
    });

    const raw  = msg.content[0].text.trim();
    const json = JSON.parse(raw.replace(/^```json\n?/, '').replace(/\n?```$/, ''));

    context.res = {
      status:  200,
      headers: { 'Content-Type': 'application/json' },
      body:    json,
    };
  } catch (err) {
    context.log.error('Summarize function error:', err);
    context.res = { status: 500, body: { error: 'AI summarization failed', detail: err.message } };
  }
};

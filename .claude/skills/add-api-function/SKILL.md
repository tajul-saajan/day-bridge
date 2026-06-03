---
name: add-api-function
description: Scaffold a new managed Azure Function (API endpoint) for DayBridge following the existing v3 pattern. Use when adding a server-side endpoint under /api — e.g. a new proxy to an external service or a new data/action endpoint.
---

# Add an Azure Function endpoint

DayBridge functions are **classic Azure Functions v3**: a folder under `api/<name>/` containing
`function.json` (binding) + `index.js` (`module.exports = async function (context, req)`).
Use `api/jira-tickets/index.js` as the canonical template (`api/summarize/index.js` for POST).

## 1. Create the function folder

`api/<name>/function.json` — choose the HTTP method(s):

```json
{
  "bindings": [
    {
      "authLevel": "anonymous",
      "type": "httpTrigger",
      "direction": "in",
      "name": "req",
      "methods": ["get"]
    },
    { "type": "http", "direction": "out", "name": "res" }
  ]
}
```

`api/<name>/index.js`:

```js
module.exports = async function (context, req) {
  // Read inputs from req.query / req.body
  // Read secrets from process.env (NEVER hardcode tokens)
  const token = process.env.MY_TOKEN;
  if (!token) {
    context.res = { status: 500, body: { error: 'MY_TOKEN not configured' } };
    return;
  }
  try {
    // ... do work (e.g. proxy an upstream API server-side) ...
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { /* stable shape the client expects */ },
    };
  } catch (err) {
    context.log.error('<name> error:', err);
    context.res = { status: 500, body: { error: err.message } };
  }
};
```

Match the existing style: plain CommonJS, return JSON with a stable shape, surface errors in an
`error` field, keep any third-party token **server-side only**.

## 2. Register the route

Add the route to `staticwebapp.config.json` `routes`:

```json
{ "route": "/api/<name>", "allowedRoles": ["anonymous"] }
```

If the function calls a **new external origin**, also widen the CSP `connect-src` in
`globalHeaders` there.

## 3. Dependencies & secrets

- New npm deps go in `api/summarize/package.json` (the API's package) and must be installed
  before deploy (the workflow runs `npm ci` in `api/summarize`).
- Declare any new secret as an env var set in **Azure Portal → Configuration**; document it in
  `.env.example`. Never commit real values.

## 4. Wire the client

Add a small fetch helper (a new `*.js` file, or extend `jira.js`/`graph.js`) and call it from
`loadLiveData` in `app.js` (typically inside the `Promise.allSettled([...])`). Normalize the
response with a `normalizeX()` shaper before rendering, and `escHtml()` any content before
`innerHTML`.

## 5. Verify

Run locally with the SWA CLI (`run-local` skill) so `/api/<name>` resolves, then check the
endpoint and the UI path that consumes it. Consider running the `wsd-compliance-reviewer`
subagent over the diff (status codes, error shape, logging, secrets handling).

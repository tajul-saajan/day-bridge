---
name: run-local
description: Run DayBridge locally and smoke-test it. Use when asked to start, serve, run, or preview the app on localhost, or to verify a change works end-to-end before deploying.
---

# Run DayBridge locally

DayBridge has **no build step**. The SPA is plain HTML/CSS/JS served statically; the `/api/*`
endpoints are managed Azure Functions that `http-server` does **not** run.

## 1. Install dependencies

```bash
npm install                         # http-server (dev server)
cd api/summarize && npm install && cd -   # @anthropic-ai/sdk for the summarize function
```

## 2. Serve the SPA

```bash
npm start                           # http-server . -p 3000 -c-1 --cors  → http://localhost:3000
```

`-c-1` disables caching; `--cors` allows the API calls. Sign-in still works locally because the
MSAL `redirectUri` is `window.location.origin` (ensure `http://localhost:3000` is registered as a
redirect URI on the Azure AD app, or test sign-in against the deployed site).

## 3. (Optional) Run the API locally

`npm start` will return 404 for `/api/jira-tickets` and `/api/summarize`. To exercise them:

- **Azure Functions Core Tools:** `cd api && func start` (needs `func` installed and a
  `local.settings.json` with `JIRA_TOKEN`, `CLAUDE_API_KEY`, etc. — never commit it).
- **SWA CLI (recommended, proxies SPA + API together):**
  `npx @azure/static-web-apps-cli start . --api-location api` → http://localhost:4280.

Provide secrets via local env only. Required: `JIRA_TOKEN`, `CLAUDE_API_KEY`
(optional `JIRA_EMAIL`, `JIRA_BASE_URL`). See `.env.example` for the full list.

## 4. Smoke test

1. Page loads and shows demo/empty data **before** sign-in.
2. "Sign in with Microsoft" → redirect → returns signed in; header shows the user.
3. Tasks, schedule, emails, weekly strip, stats bar, and productivity meter populate.
4. AI Summary banner fills in (or falls back to a stat line if `/api/summarize` is unavailable).
5. Filter pills (All / Critical / High / Medium) filter the ticket list.

If sign-in or data load fails, check the browser console and the Network tab for the Graph and
`/api/*` calls, and confirm the function secrets are set.

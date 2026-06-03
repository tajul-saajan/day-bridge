# DayBridge — Claude Code Guide

DayBridge is an internal WSD productivity dashboard. A user signs in with their Microsoft 365
account and sees their Jira tickets, today's meetings, unread emails, a weekly schedule, an
AI-generated daily briefing (via Claude), a live productivity score, and per-ticket completion
likelihood — all on one page.

**Live URL:** https://gentle-bush-0d4ceb603.7.azurestaticapps.net

## Architecture

A **vanilla-JS single-page app** (no framework, no build step) hosted on **Azure Static Web
Apps**, with two **managed Azure Functions** as a thin server-side proxy, and **MSAL
redirect-based auth** against Azure AD.

Data flow on sign-in:

```
handleLogin() → MSAL loginRedirect → Azure AD → back to app
  → initAuth() → handleRedirectPromise() → onLoginSuccess(response)   [auth.js → app.js]
  → loadLiveData(email):
      token = getAccessToken()                                        [auth.js, silent/redirect]
      Promise.allSettled([
        fetchEmails(token),            fetchCalendarEvents(token),    [graph.js → MS Graph]
        fetchWeekCalendarEvents(token), fetchMyJiraTickets(email),    [jira.js → /api/jira-tickets]
      ])
      → normalizeEmails/normalizeEvents/normalizeJira                 [shape raw → display model]
      → renderTasks/renderCalendar/renderEmails/renderWeeklySchedule  [template-literal + innerHTML]
      → updateStats() + updateProductivityMeter()
      → loadAiSummary(tasks, emails) → POST /api/summarize → Claude   [renders blockers/summary/focus]
```

Before sign-in the app renders demo/empty data so it is presentable without auth.

## File map

| File | Role |
|------|------|
| `index.html` | SPA shell: header, stats bar, AI banner, productivity strip, 3-column grid (tasks / schedule / emails), loading overlay. Data is filled in by JS. |
| `app.js` | Main client logic: `loadLiveData`, `renderTasks/Calendar/Emails/WeeklySchedule`, `updateStats`, `updateProductivityMeter`, `calcCompletionLikelihood`, `loadAiSummary`, task filtering, `escHtml`, inline-SVG icon helpers. |
| `auth.js` | MSAL: `initAuth`, `handleLogin` (redirect), `handleLogout`, `getAccessToken`. Calls `onLoginSuccess`/`onLogoutSuccess` (defined in `app.js`). |
| `graph.js` | MS Graph wrappers: `fetchEmails`, `fetchCalendarEvents`, `fetchWeekCalendarEvents` + `normalizeEmails`, `normalizeEvents`. |
| `jira.js` | Jira proxy client: `fetchMyJiraTickets(userEmail)` (calls `/api/jira-tickets`), `normalizeJira`, `normalizeStatus`. |
| `styles.css` | Design system: CSS variables + component classes (`.task-item`, `.event-item`, `.email-item`, `.stat-card`, `.ai-banner`, `.filter-pill`, …). |
| `staticwebapp.config.json` | Azure SWA routes (`/api/*`), SPA navigation fallback, and the Content-Security-Policy. |
| `api/jira-tickets/` | Azure Function (GET): proxies Jira REST search so the Jira token stays server-side. |
| `api/summarize/` | Azure Function (POST): sends tasks + emails to Claude, returns `{ summary, focusOrder, blockers }`. |
| `.env.example` | Reference only — the app does **not** read `.env` at runtime. |

## Run / build / deploy

There is **no build step** — the SPA is plain HTML/CSS/JS.

```bash
npm install                              # installs http-server (dev server)
cd api/summarize && npm install && cd -  # installs @anthropic-ai/sdk for the function
npm start                                # http-server . -p 3000 -c-1 --cors  → http://localhost:3000
```

The `/api/*` routes are not served by `http-server`. To exercise functions locally use Azure
Functions Core Tools (`func start` in `api/`) or the SWA CLI. See the `run-local` skill.

**Deploy:** GitHub Actions workflow `.github/workflows/azure-static-web-apps-gentle-bush-*.yml`
runs on push/PR to `main` (Node 20). It installs `api/summarize` deps and deploys via
`Azure/static-web-apps-deploy@v1` with `skip_app_build: true`, `app_location: /`,
`api_location: api`. PRs get staging environments. See the `deploy-check` skill.

## Conventions

- **Vanilla JS only** — no framework, no bundler, no TypeScript. Keep it that way unless asked.
- **`_privateState`** — module-level mutable state uses an underscore prefix (`_allTasks`, `_activeFilter`, `_jiraQueryUser`).
- **`normalizeX()` shapers** — raw API payloads are mapped to a stable display model before rendering. Add a normalizer rather than rendering raw API shapes.
- **Always `escHtml()` user/content data before `innerHTML`.** Rendering is template-literal + `innerHTML`; un-escaped interpolation is an XSS risk.
- **Inline SVG icon helpers** (`taskIcon()`, `calendarIcon()`, `emailIcon()`) return SVG strings — no external image assets (keeps CSP simple).
- **British spelling** in comments and copy (e.g. "colour", "initialise") — match it.
- **`app.js` has a UTF-8 BOM.** Preserve it; do not strip the BOM or re-encode the file when editing.
- Event handlers are currently inline `onclick="…"` in markup.

## Secrets & config

- **Server-side secrets** live in **Azure Portal → Static Web App → Configuration**, never in source:
  `JIRA_TOKEN`, `CLAUDE_API_KEY` (and optionally `JIRA_EMAIL`, `JIRA_BASE_URL`).
- `CLIENT_ID` and `TENANT_ID` in `auth.js` are **public** SPA values (safe to hardcode).
- MSAL scopes: `User.Read`, `Mail.Read`, `Calendars.Read`. Cache: `sessionStorage`.
- When adding an API endpoint, add its route to `staticwebapp.config.json`; when calling a new
  external origin from the browser, widen the CSP `connect-src` there too.

## API details

Both functions use the **classic Azure Functions v3** model: `module.exports = async function (context, req)` + a sibling `function.json` (`authLevel: anonymous`).

- **`api/jira-tickets`** (GET): Basic-auth to Jira with `JIRA_EMAIL:JIRA_TOKEN`,
  base `JIRA_BASE_URL` (default `https://wallstreetdocs.atlassian.net`). Queries the
  authenticated caller's own tickets (identity from the bearer token, not a param). JQL:
  `assignee = "${caller}" AND statusCategory != Done ORDER BY priority ASC, due ASC` (max 20).
  Returns `{ issues, total, queryUser, authEmail, error }`.
- **`api/summarize`** (POST `{ tasks, emails }`): uses `@anthropic-ai/sdk` (`^0.30.0`), model
  `claude-opus-4-6`, `max_tokens: 600`. Returns `{ summary, focusOrder, blockers }`.

## Domain logic

Two scoring formulas live in `app.js` — read them there rather than duplicating:
- `calcCompletionLikelihood(task)` — per-ticket %; base by status, ± priority, ± due-date proximity; clamped [5, 95].
- `updateProductivityMeter(tasks, eventCount)` — 0–100 score: `40 + min(25, inFlight*8) − overdue*10 + min(20, meetings*4)`, mapped to labelled tiers.

Stats bar: Open Tickets / Done Today (from Jira), Meetings (Graph calendar), Unread Emails (Graph).

## WSD standards

This repo is part of the WSD org; the standards loaded in `~/.claude/CLAUDE.md`
(WSD-001/007/011/012/014/015 etc.) apply. Known accepted deviation: DayBridge is a static SWA
with managed Functions, **not** containers on Kubernetes (WSD-008/012) — it is intentionally
lightweight. For any backend/API change, run it past the **`wsd-compliance-reviewer`** subagent.

## Specialists & workflows

- Subagents: `wsd-compliance-reviewer` (audit a diff vs WSD), `daybridge-frontend` (SPA work),
  `azure-functions-dev` (the proxy functions), `ui-design-reviewer` (styles/design-system).
- Skills: `run-local`, `add-api-function`, `add-graph-source`, `deploy-check`.

## Gotchas

- Functions are `anonymous` auth at the SWA layer — there is no per-user server-side auth gate today.
- Jira and Claude tokens must stay server-side; never call Jira/Anthropic directly from the browser.
- Editing `app.js`: keep the BOM and British spelling; render through `escHtml` + `normalizeX`.
- New endpoint or new external origin ⇒ update `staticwebapp.config.json` (routes and/or CSP).

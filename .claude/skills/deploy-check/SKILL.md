---
name: deploy-check
description: Pre-deploy verification and the Azure Static Web Apps / GitHub Actions deploy flow for DayBridge. Use when preparing to ship, before merging to main, or when validating that a deployment succeeded.
---

# Deploy check & flow

DayBridge deploys to **Azure Static Web Apps** via GitHub Actions. There is no build step; the
SPA is uploaded as-is and the `api/` folder is deployed as managed Functions.

## Pre-deploy checklist

1. **Smoke test locally** (`run-local` skill): sign-in + data load + AI summary + filters work.
2. **Secrets present in Azure** (Portal → Static Web App → Configuration):
   `JIRA_TOKEN`, `CLAUDE_API_KEY` (and `JIRA_EMAIL`/`JIRA_BASE_URL` if overriding defaults).
   These are **not** in source and not in the workflow.
3. **Config updated** if you changed the API surface:
   - new endpoint → route added in `staticwebapp.config.json`
   - new external origin called from the browser → CSP `connect-src` widened
4. **API deps committed** — if you added an npm dependency, `api/summarize/package.json` and its
   lockfile are updated (the workflow runs `npm ci` in `api/summarize`).
5. **No secrets committed** — grep the diff for tokens/keys; confirm `.env` is gitignored.

## Deploy flow

- The workflow `.github/workflows/azure-static-web-apps-gentle-bush-*.yml` runs on **push/PR to
  `main`** (Node 20). It installs `api/summarize` deps and runs `Azure/static-web-apps-deploy@v1`
  with `skip_app_build: true`, `app_location: /`, `api_location: api`.
- **PRs** get an ephemeral **staging environment** (a preview URL on the SWA); it's torn down when
  the PR closes.
- Merging/pushing to `main` deploys to production.

## Post-deploy verification

1. Open the production URL: https://gentle-bush-0d4ceb603.7.azurestaticapps.net
2. Sign in and confirm tasks/calendar/emails load and the AI summary renders.
3. Spot-check the functions: `/api/jira-tickets?user=<email>` returns issues;
   `/api/summarize` (POST) returns `{ summary, focusOrder, blockers }`.
4. Watch the Actions run for green; if the deploy failed, check the job logs and the SWA
   deployment token secret.

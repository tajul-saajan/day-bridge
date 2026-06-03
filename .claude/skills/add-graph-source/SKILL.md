---
name: add-graph-source
description: Add a new Microsoft Graph data panel to DayBridge end-to-end (fetch + normalize + render + markup + style). Use when surfacing additional Graph data such as Teams chats, tasks/To-Do, files, or presence.
---

# Add a Microsoft Graph data source

Follow the existing pattern used for emails and calendar (`graph.js` + `app.js` + `index.html`).
Everything is delegated-permission Graph calls with the signed-in user's bearer token.

## 1. Fetch + normalize (`graph.js`)

Add a `fetchX(accessToken)` that calls Graph with the token and a tight `$select`/`$filter`,
and a `normalizeX(raw)` that maps the payload to a stable display model (mirror
`normalizeEmails`/`normalizeEvents`):

```js
const GRAPH = 'https://graph.microsoft.com/v1.0';

async function fetchX(accessToken) {
  const url = `${GRAPH}/me/...?$select=...&$top=...`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Graph X: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.value || [];
}

function normalizeX(raw) {
  return raw.map(item => ({ /* id, title, … display fields only */ }));
}
```

**Scopes:** if the new resource needs a permission beyond `User.Read`, `Mail.Read`,
`Calendars.Read`, add it to `LOGIN_SCOPES` in `auth.js` (and grant it on the Azure AD app).

## 2. Wire into the load pipeline (`app.js`)

Add `fetchX(token)` to the `Promise.allSettled([...])` in `loadLiveData`, then guard the result
(`status === 'fulfilled' ? normalizeX(value) : []`) exactly like the other sources, and call your
new `renderX(...)`.

## 3. Render (`app.js`)

Add `renderX(items)` using the template-literal + `innerHTML` style. **`escHtml()` every piece of
content.** Use an inline-SVG empty state (see `taskIcon`/`calendarIcon`/`emailIcon` + `emptyState`).

## 4. Markup + style

Add the container/section in `index.html` (give it an `id` your `renderX` targets and a count
badge if relevant), and add component styles in `styles.css` reusing existing CSS variables and
class patterns (`.list-container`, `.*-item`, badges).

## 5. Conventions & verify

- Vanilla JS, `_privateState` if you keep filter/state, British spelling, preserve `app.js`'s BOM.
- No new external origin is needed (Graph is already in the CSP `connect-src`).
- Smoke test via the `run-local` skill: sign in and confirm the new panel populates and its empty
  state shows when there's no data.

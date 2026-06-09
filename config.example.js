// DayBridge — front-end runtime config (no build step).
//
// Copy this file to `config.js` (gitignored) to override MSAL settings per
// environment. The SPA reads `window.DAYBRIDGE_CONFIG` in auth.js. All values
// here are PUBLIC Azure AD app-registration values, not secrets.
//
//   cp config.example.js config.js
//
// To sign in (SSO) from local, set redirectUri to your local origin AND add the
// exact same URI to the Azure AD app registration:
//   Azure Portal → App registrations → (DayBridge) → Authentication →
//   Single-page application → Redirect URIs → add e.g. http://localhost:3000
//
// In production, omit config.js entirely — redirectUri then defaults to
// window.location.origin (the deployed Static Web App URL).

window.DAYBRIDGE_CONFIG = {
  // Where Azure AD sends the user back after sign-in. Must be registered on the
  // app (see above). Defaults to window.location.origin when unset.
  redirectUri: 'http://localhost:3000',

  // Optional — only needed to point local dev at a different app registration.
  // clientId: '50575903-5945-4162-b6ad-8d9ad175034d',
  // tenantId: 'a3be1280-7a3a-4edc-b258-0d6a539beee9',
};

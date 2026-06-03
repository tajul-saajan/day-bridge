// MSAL Authentication — Microsoft identity platform

const AUTH_CONFIG = {
  clientId:   '50575903-5945-4162-b6ad-8d9ad175034d',
  tenantId:   'a3be1280-7a3a-4edc-b258-0d6a539beee9',
  redirectUri: window.location.origin,
};

const msalConfig = {
  auth: {
    clientId:    AUTH_CONFIG.clientId,
    authority:   `https://login.microsoftonline.com/${AUTH_CONFIG.tenantId}`,
    redirectUri: AUTH_CONFIG.redirectUri,
  },
  cache: {
    cacheLocation:           'sessionStorage',
    storeAuthStateInCookie:  false,
  },
  system: {
    allowNativeBroker: false,   // prevents broker interference causing first-attempt failure
  },
};

const LOGIN_SCOPES = ['User.Read', 'Mail.Read', 'Calendars.Read'];

let msalInstance   = null;
let currentAccount = null;
let _authReady     = null;   // promise that resolves when initAuth completes

function getMsalInstance() {
  if (!msalInstance) {
    if (typeof msal === 'undefined') {
      throw new Error('MSAL library not loaded. Add the CDN script tag to index.html.');
    }
    msalInstance = new msal.PublicClientApplication(msalConfig);
  }
  return msalInstance;
}

async function handleLogin() {
  try {
    showLoading('Signing in…');
    const instance = getMsalInstance();
    const response  = await instance.loginPopup({ scopes: LOGIN_SCOPES });
    currentAccount  = response.account;
    onLoginSuccess(response);
  } catch (err) {
    hideLoading();
    if (err.errorCode === 'user_cancelled') return;
    console.error('Login failed:', err);
    alert(`Sign-in failed: ${err.message}`);
  }
}

function handleLogout() {
  // Local-only logout — clears MSAL session cache without any popup or redirect
  try {
    const keys = Object.keys(sessionStorage).filter(k =>
      k.startsWith('msal.') || k.includes(AUTH_CONFIG.clientId)
    );
    keys.forEach(k => sessionStorage.removeItem(k));
  } catch (err) {
    console.warn('Logout cache clear:', err);
  }
  currentAccount = null;
  msalInstance   = null;   // force fresh instance on next login
  onLogoutSuccess();
}

async function getAccessToken() {
  const instance = getMsalInstance();
  const accounts = instance.getAllAccounts();
  if (!accounts.length) throw new Error('No signed-in account.');

  try {
    const response = await instance.acquireTokenSilent({
      scopes:  LOGIN_SCOPES,
      account: accounts[0],
    });
    return response.accessToken;
  } catch {
    const response = await instance.acquireTokenPopup({ scopes: LOGIN_SCOPES });
    return response.accessToken;
  }
}

// Called once on page load — checks for an existing session
async function initAuth() {
  _authReady = (async () => {
    try {
      const instance = getMsalInstance();
      await instance.handleRedirectPromise();

      // If this page is running inside the MSAL popup window,
      // do nothing — MSAL has already sent the result to the parent.
      // The popup will close itself; calling onLoginSuccess here would
      // trigger a full data load inside the popup (causing the stuck spinner).
      if (window.opener) return;

      const accounts = instance.getAllAccounts();
      if (accounts.length) {
        currentAccount = accounts[0];
        onLoginSuccess({ account: accounts[0] });
      }
    } catch (err) {
      console.warn('Auth init:', err);
    }
  })();
  return _authReady;
}

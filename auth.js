// MSAL Authentication — redirect-based (no popup, no first-attempt failures)

const AUTH_CONFIG = {
  clientId:   '50575903-5945-4162-b6ad-8d9ad175034d',
  tenantId:   'a3be1280-7a3a-4edc-b258-0d6a539beee9',
  redirectUri: window.location.origin,
};

const msalConfig = {
  auth: {
    clientId:                AUTH_CONFIG.clientId,
    authority:               `https://login.microsoftonline.com/${AUTH_CONFIG.tenantId}`,
    redirectUri:             AUTH_CONFIG.redirectUri,
    navigateToLoginRequestUrl: false,
  },
  cache: {
    cacheLocation:          'sessionStorage',
    storeAuthStateInCookie: false,
  },
};

const LOGIN_SCOPES        = ['User.Read', 'Mail.Read', 'Calendars.Read'];
const TEAMS_SCOPES        = ['Chat.Read'];   // requires admin consent — requested separately

let msalInstance   = null;
let currentAccount = null;

function getMsalInstance() {
  if (!msalInstance) {
    if (typeof msal === 'undefined') {
      throw new Error('MSAL library not loaded.');
    }
    msalInstance = new msal.PublicClientApplication(msalConfig);
  }
  return msalInstance;
}

// Sign in — full page redirect, no popup
async function handleLogin() {
  try {
    const instance = getMsalInstance();
    await instance.loginRedirect({ scopes: LOGIN_SCOPES });
    // Page navigates away — nothing after this runs
  } catch (err) {
    console.error('Login redirect failed:', err);
    alert(`Sign-in failed: ${err.message}`);
  }
}

// Sign out — local cache clear, instant, no popup
function handleLogout() {
  try {
    const prefix = AUTH_CONFIG.clientId;
    Object.keys(sessionStorage)
      .filter(k => k.startsWith('msal.') || k.includes(prefix))
      .forEach(k => sessionStorage.removeItem(k));
  } catch (err) {
    console.warn('Logout:', err);
  }
  currentAccount = null;
  msalInstance   = null;
  onLogoutSuccess();
}

async function getAccessToken() {
  const instance = getMsalInstance();
  const accounts = instance.getAllAccounts();
  if (!accounts.length) throw new Error('No signed-in account.');

  try {
    const res = await instance.acquireTokenSilent({
      scopes:  LOGIN_SCOPES,
      account: accounts[0],
    });
    return res.accessToken;
  } catch {
    // Silent failed — redirect to get a fresh token
    await instance.acquireTokenRedirect({ scopes: LOGIN_SCOPES });
  }
}

// Try to get a Teams token silently — returns null if Chat.Read not consented
async function getTeamsToken() {
  try {
    const instance = getMsalInstance();
    const accounts = instance.getAllAccounts();
    if (!accounts.length) return null;
    const res = await instance.acquireTokenSilent({
      scopes:  TEAMS_SCOPES,
      account: accounts[0],
    });
    return res.accessToken;
  } catch {
    return null;   // Chat.Read not granted — skip Teams silently
  }
}

// Called on every page load — handles both the redirect callback and existing sessions
async function initAuth() {
  try {
    const instance = getMsalInstance();

    // Process the redirect response if we just came back from Microsoft login
    const response = await instance.handleRedirectPromise();
    if (response?.account) {
      currentAccount = response.account;
      onLoginSuccess(response);
      return;
    }

    // Check for an existing cached session
    const accounts = instance.getAllAccounts();
    if (accounts.length) {
      currentAccount = accounts[0];
      onLoginSuccess({ account: accounts[0] });
    }
  } catch (err) {
    console.warn('Auth init:', err);
  }
}

// MSAL Authentication — requires @azure/msal-browser loaded via CDN or bundler
// Replace CLIENT_ID and TENANT_ID with values from your AAD App Registration

const AUTH_CONFIG = {
  clientId:   window.ENV?.CLIENT_ID   || 'YOUR_CLIENT_ID',
  tenantId:   window.ENV?.TENANT_ID   || 'YOUR_TENANT_ID',
  redirectUri: window.location.origin,
};

const msalConfig = {
  auth: {
    clientId:    AUTH_CONFIG.clientId,
    authority:   `https://login.microsoftonline.com/${AUTH_CONFIG.tenantId}`,
    redirectUri: AUTH_CONFIG.redirectUri,
  },
  cache: {
    cacheLocation:      'sessionStorage',
    storeAuthStateInCookie: false,
  },
};

const LOGIN_SCOPES = ['User.Read', 'Mail.Read', 'Calendars.Read'];

let msalInstance = null;
let currentAccount = null;

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
    const response = await instance.loginPopup({ scopes: LOGIN_SCOPES });
    currentAccount = response.account;
    onLoginSuccess(response);
  } catch (err) {
    console.error('Login failed:', err);
    hideLoading();
    alert(`Sign-in failed: ${err.message}`);
  }
}

async function handleLogout() {
  const instance = getMsalInstance();
  await instance.logoutPopup({ account: currentAccount });
  currentAccount = null;
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
    // Silent refresh failed — fall back to popup
    const response = await instance.acquireTokenPopup({ scopes: LOGIN_SCOPES });
    return response.accessToken;
  }
}

// Check for existing session on page load
async function initAuth() {
  try {
    const instance = getMsalInstance();
    await instance.handleRedirectPromise();
    const accounts = instance.getAllAccounts();
    if (accounts.length) {
      currentAccount = accounts[0];
      onLoginSuccess({ account: accounts[0] });
    }
  } catch (err) {
    console.warn('Auth init:', err);
  }
}

import API_CONFIG from '../config/api.js';
import { msalConfig } from '../authConfig.js';
import { msalInstance } from '../msalInstance.js';

export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Signing you out...';

let sessionLogoutInProgress = false;

/** @internal Reset guard for tests */
export function resetSessionLogoutGuard() {
  sessionLogoutInProgress = false;
}

export function isSessionExpiredError(error) {
  return /session has expired/i.test(error?.message || '');
}

export function redirectToLogin() {
  if (typeof window === 'undefined' || window.location.pathname.startsWith('/login')) {
    return;
  }
  window.location.assign('/login');
}

/**
 * Clear server session and sign out of Entra. Safe to call multiple times (deduped).
 */
export async function logoutOnSessionExpired() {
  if (sessionLogoutInProgress) {
    return;
  }
  sessionLogoutInProgress = true;

  try {
    await fetch(`${API_CONFIG.BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    // Token may already be invalid
  }

  const account = msalInstance.getActiveAccount();
  try {
    if (account) {
      await msalInstance.logoutRedirect({
        account,
        postLogoutRedirectUri: msalConfig.auth.postLogoutRedirectUri,
      });
      return;
    }
  } catch (err) {
    console.error(err);
  }

  sessionLogoutInProgress = false;
  window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  redirectToLogin();
}

/** Sign out, then reject (for axios interceptors). */
export async function rejectExpiredSession() {
  await logoutOnSessionExpired();
  return Promise.reject(new Error(SESSION_EXPIRED_MESSAGE));
}

/** Sign out, then throw (for fetch and other async callers). */
export async function throwExpiredSession() {
  await logoutOnSessionExpired();
  throw new Error(SESSION_EXPIRED_MESSAGE);
}

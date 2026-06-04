import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../msalInstance.js', () => ({
  msalInstance: {
    logoutRedirect: vi.fn(),
    getActiveAccount: vi.fn(),
  },
}));

vi.mock('../authConfig.js', () => ({
  msalConfig: {
    auth: { postLogoutRedirectUri: 'http://localhost:5173/login' },
  },
}));

vi.mock('../config/api.js', () => ({
  default: { BASE_URL: 'http://localhost:8080' },
}));

import { msalInstance } from '../msalInstance.js';
import {
  isSessionExpiredError,
  logoutOnSessionExpired,
  rejectExpiredSession,
  resetSessionLogoutGuard,
  throwExpiredSession,
} from './sessionLogout.js';

describe('logoutOnSessionExpired', () => {
  beforeEach(() => {
    resetSessionLogoutGuard();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    msalInstance.logoutRedirect.mockResolvedValue(undefined);
    msalInstance.getActiveAccount.mockReturnValue({ username: 'user@test.com' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    resetSessionLogoutGuard();
  });

  it('calls backend logout and MSAL logoutRedirect', async () => {
    await logoutOnSessionExpired();

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8080/auth/logout',
      expect.objectContaining({ method: 'POST' })
    );
    expect(msalInstance.logoutRedirect).toHaveBeenCalledWith({
      account: { username: 'user@test.com' },
      postLogoutRedirectUri: 'http://localhost:5173/login',
    });
  });

  it('redirects to login when no MSAL account is active', async () => {
    const assignMock = vi.fn();
    vi.stubGlobal('location', { pathname: '/billing', assign: assignMock });
    msalInstance.getActiveAccount.mockReturnValue(null);

    await logoutOnSessionExpired();

    expect(msalInstance.logoutRedirect).not.toHaveBeenCalled();
    expect(assignMock).toHaveBeenCalledWith('/login');
  });

  it('only runs once when called in parallel', async () => {
    await Promise.all([logoutOnSessionExpired(), logoutOnSessionExpired()]);
    expect(msalInstance.logoutRedirect).toHaveBeenCalledTimes(1);
  });
});

describe('session expiry helpers', () => {
  beforeEach(() => {
    resetSessionLogoutGuard();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    msalInstance.logoutRedirect.mockResolvedValue(undefined);
    msalInstance.getActiveAccount.mockReturnValue({ username: 'user@test.com' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    resetSessionLogoutGuard();
  });

  it('rejectExpiredSession signs out and rejects', async () => {
    await expect(rejectExpiredSession()).rejects.toThrow(/session has expired/i);
    expect(msalInstance.logoutRedirect).toHaveBeenCalled();
  });

  it('throwExpiredSession signs out and throws', async () => {
    await expect(throwExpiredSession()).rejects.toThrow(/session has expired/i);
    expect(msalInstance.logoutRedirect).toHaveBeenCalled();
  });

  it('isSessionExpiredError identifies session expiry rejections', () => {
    expect(isSessionExpiredError(new Error('Your session has expired. Signing you out...'))).toBe(
      true
    );
    expect(isSessionExpiredError(new Error('Network error'))).toBe(false);
  });
});

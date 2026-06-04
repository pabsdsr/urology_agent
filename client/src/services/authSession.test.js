import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError } from 'axios';
import { getJwtExpiryMs, isTokenExpired, isTokenExpiringSoon } from './authTokenUtils.js';
import { buildTestJwt } from './authTestUtils.js';

const logoutOnSessionExpiredMock = vi.fn().mockResolvedValue(undefined);

vi.mock('./sessionLogout.js', () => ({
  SESSION_EXPIRED_MESSAGE: 'Your session has expired. Signing you out...',
  isSessionExpiredError: (error) => /session has expired/i.test(error?.message || ''),
  logoutOnSessionExpired: (...args) => logoutOnSessionExpiredMock(...args),
  rejectExpiredSession: async () => {
    await logoutOnSessionExpiredMock();
    return Promise.reject(new Error('Your session has expired. Signing you out...'));
  },
  throwExpiredSession: async () => {
    await logoutOnSessionExpiredMock();
    throw new Error('Your session has expired. Signing you out...');
  },
  resetSessionLogoutGuard: () => {
    logoutOnSessionExpiredMock.mockClear();
  },
}));

vi.mock('../msalInstance.js', () => ({
  msalInstance: {
    getActiveAccount: vi.fn(),
    acquireTokenSilent: vi.fn(),
    acquireTokenPopup: vi.fn(),
    logoutRedirect: vi.fn(),
  },
}));

vi.mock('../authConfig.js', () => ({
  loginRequest: { scopes: ['openid'] },
  msalConfig: {
    auth: { postLogoutRedirectUri: 'http://localhost:5173/login' },
  },
}));

vi.mock('../config/api.js', () => ({
  default: { BASE_URL: 'http://localhost:8080', TIMEOUT: 60000 },
}));

import { msalInstance } from '../msalInstance.js';
import { acquireAuthToken, requireAuthToken } from './apiClient.js';
import apiClient from './apiClient.js';

describe('authTokenUtils', () => {
  it('detects expired tokens', () => {
    const expired = buildTestJwt(Math.floor(Date.now() / 1000) - 60);
    expect(isTokenExpired(expired)).toBe(true);
  });

  it('detects valid tokens', () => {
    const valid = buildTestJwt(Math.floor(Date.now() / 1000) + 3600);
    expect(isTokenExpired(valid)).toBe(false);
    expect(isTokenExpiringSoon(valid)).toBe(false);
  });

  it('detects tokens expiring soon', () => {
    const soon = buildTestJwt(Math.floor(Date.now() / 1000) + 120);
    expect(isTokenExpiringSoon(soon)).toBe(true);
    expect(isTokenExpired(soon)).toBe(false);
  });

  it('reads exp from jwt payload', () => {
    const exp = Math.floor(Date.now() / 1000) + 500;
    const token = buildTestJwt(exp);
    expect(getJwtExpiryMs(token)).toBe(exp * 1000);
  });
});

describe('acquireAuthToken', () => {
  const account = { username: 'user@test.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    msalInstance.getActiveAccount.mockReturnValue(account);
  });

  it('returns null when tokens are expired after interaction', async () => {
    const expired = buildTestJwt(Math.floor(Date.now() / 1000) - 10);
    const { InteractionRequiredAuthError } = await import('@azure/msal-browser');

    msalInstance.acquireTokenSilent.mockRejectedValue(
      new InteractionRequiredAuthError('interaction_required')
    );
    msalInstance.acquireTokenPopup.mockResolvedValue({ idToken: expired });

    await expect(acquireAuthToken()).resolves.toBeNull();
  });

  it('refreshes when token is expiring soon', async () => {
    const soon = buildTestJwt(Math.floor(Date.now() / 1000) + 60);
    const fresh = buildTestJwt(Math.floor(Date.now() / 1000) + 3600);

    msalInstance.acquireTokenSilent
      .mockResolvedValueOnce({ idToken: soon })
      .mockResolvedValueOnce({ idToken: fresh });

    const token = await acquireAuthToken();
    expect(token).toBe(fresh);
    expect(msalInstance.acquireTokenSilent).toHaveBeenCalledTimes(2);
    expect(msalInstance.acquireTokenSilent.mock.calls[1][0].forceRefresh).toBe(true);
  });
});

describe('requireAuthToken', () => {
  const account = { username: 'user@test.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    logoutOnSessionExpiredMock.mockClear();
    msalInstance.getActiveAccount.mockReturnValue(account);
  });

  it('returns a valid token', async () => {
    const valid = buildTestJwt(Math.floor(Date.now() / 1000) + 3600);
    msalInstance.acquireTokenSilent.mockResolvedValue({ idToken: valid });

    await expect(requireAuthToken()).resolves.toBe(valid);
  });

  it('ends session when token acquisition fails', async () => {
    const expired = buildTestJwt(Math.floor(Date.now() / 1000) - 10);
    msalInstance.acquireTokenSilent.mockResolvedValue({ idToken: expired });

    await expect(requireAuthToken()).rejects.toThrow(/session has expired/i);
    expect(logoutOnSessionExpiredMock).toHaveBeenCalled();
  });
});

describe('apiClient session expiry', () => {
  const account = { username: 'user@test.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    logoutOnSessionExpiredMock.mockClear();
    msalInstance.getActiveAccount.mockReturnValue(account);
  });

  it('logs out on 401 when token refresh cannot produce a valid jwt', async () => {
    const fresh = buildTestJwt(Math.floor(Date.now() / 1000) + 3600);
    const expired = buildTestJwt(Math.floor(Date.now() / 1000) - 10);
    let silentCalls = 0;
    msalInstance.acquireTokenSilent.mockImplementation(async () => {
      silentCalls += 1;
      return { idToken: silentCalls === 1 ? fresh : expired };
    });

    await expect(
      apiClient.get('/patients?given=test', {
        adapter: async (config) => {
          throw new AxiosError(
            'Unauthorized',
            AxiosError.ERR_BAD_REQUEST,
            config,
            {},
            {
              status: 401,
              statusText: 'Unauthorized',
              data: { detail: 'Signature has expired' },
              headers: {},
              config,
            }
          );
        },
      })
    ).rejects.toThrow(/session has expired/i);

    expect(logoutOnSessionExpiredMock).toHaveBeenCalled();
    expect(silentCalls).toBeGreaterThanOrEqual(2);
  });

  it('logs out before request when no valid token is available', async () => {
    const expired = buildTestJwt(Math.floor(Date.now() / 1000) - 10);
    msalInstance.acquireTokenSilent.mockResolvedValue({ idToken: expired });

    await expect(apiClient.get('/patients?given=test')).rejects.toThrow(
      /session has expired/i
    );
    expect(logoutOnSessionExpiredMock).toHaveBeenCalled();
  });
});

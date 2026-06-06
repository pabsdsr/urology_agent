/**
 * Axios API client with Entra token attachment and session-expiry handling.
 */

import axios from 'axios';
import { InteractionRequiredAuthError } from '@azure/msal-browser';
import API_CONFIG from '../config/api.js';
import { msalInstance } from '../msalInstance.js';
import { loginRequest } from '../authConfig.js';
import { isTokenExpired, isTokenExpiringSoon } from './authTokenUtils.js';
import {
  isSessionExpiredError,
  rejectExpiredSession,
  throwExpiredSession,
} from './sessionLogout.js';

function tokenFromAuthResult(response) {
  const token = response?.idToken || response?.accessToken || null;
  if (!token || isTokenExpired(token)) {
    return null;
  }
  return token;
}

/**
 * Acquire a fresh ID token for API calls (Entra validates ID token aud = client id).
 */
export async function acquireAuthToken({ forceRefresh = false } = {}) {
  const account = msalInstance.getActiveAccount();
  if (!account) {
    return null;
  }

  const silent = (refresh) =>
    msalInstance.acquireTokenSilent({
      ...loginRequest,
      account,
      forceRefresh: refresh,
    });

  try {
    let response = await silent(forceRefresh);
    let token = tokenFromAuthResult(response);
    if (token && !forceRefresh && isTokenExpiringSoon(token)) {
      response = await silent(true);
      token = tokenFromAuthResult(response);
    }
    return token;
  } catch (error) {
    if (!(error instanceof InteractionRequiredAuthError)) {
      throw error;
    }
    try {
      const response = await msalInstance.acquireTokenPopup({
        ...loginRequest,
        account,
      });
      return tokenFromAuthResult(response);
    } catch (popupError) {
      console.error(popupError);
      throw error;
    }
  }
}

/** Returns a bearer token or ends the session (never returns null). */
export async function requireAuthToken() {
  try {
    const token = await acquireAuthToken();
    if (token) {
      return token;
    }
  } catch {
    // Fall through to session expiry handling
  }
  return throwExpiredSession();
}

function applyAuthHeader(config, token) {
  config.headers.Authorization = `Bearer ${token}`;
}

async function attachAuthToken(config) {
  try {
    const token = await acquireAuthToken();
    if (!token) {
      return rejectExpiredSession();
    }
    applyAuthHeader(config, token);
  } catch {
    return rejectExpiredSession();
  }
  return config;
}

function isLogoutRequest(config) {
  return config?.url === '/auth/logout';
}

function isUnauthorizedResponse(error) {
  return (
    error.response?.status === 401 &&
    error.config &&
    !isLogoutRequest(error.config)
  );
}

const apiClient = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use(
  async (config) => {
    if (msalInstance.getActiveAccount() && !isLogoutRequest(config)) {
      config = await attachAuthToken(config);
    }

    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    } else if (!config.headers['Content-Type']) {
      config.headers['Content-Type'] = 'application/json';
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (isUnauthorizedResponse(error)) {
      const { config } = error;
      if (!config._authRetry) {
        config._authRetry = true;
        try {
          const token = await acquireAuthToken({ forceRefresh: true });
          if (token) {
            applyAuthHeader(config, token);
            return apiClient(config);
          }
        } catch (refreshError) {
          console.error(refreshError);
        }
      }
      return rejectExpiredSession();
    }

    if (!error.response && !isSessionExpiredError(error)) {
      console.error('Network error:', error.message);
      error.message = 'Network error. Please check your connection.';
    }

    if (error.response?.status >= 500) {
      console.error('Server error:', error.response.status, error.response.data);
      const detail = error.response?.data?.detail;
      error.message =
        typeof detail === 'string' && detail.trim()
          ? detail
          : 'Server error. Please try again later.';
    }

    return Promise.reject(error);
  }
);

export default apiClient;

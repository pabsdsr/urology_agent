/**
 * Axios API Client
 * Centralized HTTP client with interceptors and error handling
 */

import axios from 'axios';
import API_CONFIG from '../config/api.js';
import { msalInstance } from '../msalInstance.js';
import { loginRequest } from '../authConfig.js';

/**
 * Headers for authenticated JSON API calls (Microsoft Entra via MSAL).
 */
export async function getAuthHeaders() {
  const account = msalInstance.getActiveAccount();
  if (!account) {
    return {
      'Content-Type': 'application/json',
    };
  }

  try {
    const response = await msalInstance.acquireTokenSilent({
      ...loginRequest,
      account,
    });
    // OIDC scopes yield an access token for Graph (wrong aud for our API). ID token aud = client id.
    const token = response.idToken || response.accessToken;
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    };
  } catch {
    try {
      await msalInstance.acquireTokenRedirect({
        ...loginRequest,
        account,
      });
    } catch (err) {
      console.error(err);
    }
    return {
      'Content-Type': 'application/json',
    };
  }
}

// Create axios instance with base configuration
const apiClient = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — MSAL token (do not set JSON Content-Type on multipart bodies)
apiClient.interceptors.request.use(
  async (config) => {
    const headers = await getAuthHeaders();
    if (headers.Authorization) {
      config.headers.Authorization = headers.Authorization;
    }
    if (!(config.data instanceof FormData) && headers['Content-Type']) {
      config.headers['Content-Type'] = headers['Content-Type'];
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle common errors
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Handle 401 Unauthorized - notify app to re-authenticate
    if (error.response?.status === 401) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      // Customize 401 error message
      error.message =
        'Your session has expired or you are not authorized. Please sign in again.';
    }

    // Handle network errors
    if (!error.response) {
      console.error('Network error:', error.message);
      error.message = 'Network error. Please check your connection.';
    }

    // Handle server errors
    if (error.response?.status >= 500) {
      console.error('Server error:', error.response.status, error.response.data);
      error.message = 'Server error. Please try again later.';
    }

    return Promise.reject(error);
  }
);

export default apiClient;


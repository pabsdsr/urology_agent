/**
 * Authentication Service
 * Thin helpers around the current MSAL + /auth API model.
 */

import apiClient from './apiClient.js';
import { msalInstance } from '../msalInstance.js';
import { loginRequest } from '../authConfig.js';

export const authService = {
  /**
   * Start Microsoft Entra sign-in via MSAL redirect.
   */
  loginWithEntra: async () => {
    await msalInstance.loginRedirect(loginRequest);
  },

  /**
   * Logout current user
   * @returns {Promise} Logout confirmation
   */
  logout: async () => {
    const response = await apiClient.post('/auth/logout');
    return response.data;
  },

  /**
   * Check if current session is valid
   * @returns {Promise} User data if authenticated
   */
  checkAuth: async () => {
    const response = await apiClient.get('/auth/me');
    return response.data;
  },
};

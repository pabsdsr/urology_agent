/**
 * Authentication Service
 * Handles all authentication-related API calls
 */

import apiClient from './apiClient.js';
import API_CONFIG from '../config/api.js';

export const authService = {
  /**
   * Login user with ModMed credentials
   * @param {Object} credentials - { username, password }
   * @returns {Promise} Response with session token and user data
   */
  login: async (credentials) => {
    const response = await apiClient.post('/auth/login', credentials);
    return response.data;
  },

  /**
   * Redirect to Microsoft Outlook OAuth login
   */
  loginWithOutlook: () => {
    window.location.href = `${API_CONFIG.BASE_URL}/auth/outlook/authorize`;
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

/**
 * Axios API Client
 * Centralized HTTP client with interceptors and error handling
 */

import axios from 'axios';
import API_CONFIG from '../config/api.js';

// Create axios instance with base configuration
const apiClient = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Add auth token to requests
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('session_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
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
    // Handle 401 Unauthorized - clear token and redirect to login
    if (error.response?.status === 401) {
      localStorage.removeItem('session_token');
      // Dispatch custom event for auth context to handle
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      // Customize 401 error message
      error.message = 'Invalid username or password. Please check your credentials.';
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

// Retry logic for failed requests
const retryRequest = async (originalRequest, retryCount = 0) => {
  if (retryCount >= API_CONFIG.RETRY_ATTEMPTS) {
    throw originalRequest;
  }

  // Wait before retrying
  await new Promise(resolve => setTimeout(resolve, API_CONFIG.RETRY_DELAY * (retryCount + 1)));

  try {
    return await apiClient(originalRequest);
  } catch (error) {
    // Only retry on network errors or 5xx server errors
    if (!error.response || error.response.status >= 500) {
      return retryRequest(originalRequest, retryCount + 1);
    }
    throw error;
  }
};

// Enhanced API client with retry capability
const apiClientWithRetry = {
  get: (url, config = {}) => {
    return retryRequest({ method: 'get', url, ...config });
  },
  post: (url, data, config = {}) => {
    return retryRequest({ method: 'post', url, data, ...config });
  },
  put: (url, data, config = {}) => {
    return retryRequest({ method: 'put', url, data, ...config });
  },
  delete: (url, config = {}) => {
    return retryRequest({ method: 'delete', url, ...config });
  },
};

export default apiClient;
export { apiClientWithRetry };


import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/authService.js';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('session_token'));
  const [loading, setLoading] = useState(true);

  // Check if user is authenticated on app load
  useEffect(() => {
    const checkAuth = async () => {
      const storedToken = localStorage.getItem('session_token');
      if (storedToken) {
        try {
          const userData = await authService.checkAuth();
          setUser(userData);
          setToken(storedToken);
        } catch (error) {
          console.error('Auth check failed:', error);
          // Token invalid, clear it (apiClient handles this automatically)
          setToken(null);
          setUser(null);
        }
      }
      setLoading(false);
    };

    // Listen for unauthorized events from apiClient
    const handleUnauthorized = () => {
      setToken(null);
      setUser(null);
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    checkAuth();

    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, []);

  const login = async (credentials) => {
    setLoading(true);
    try {
      const data = await authService.login(credentials);

      if (data.success) {
        localStorage.setItem('session_token', data.session_token);
        setToken(data.session_token);
        setUser({
          username: data.username,
          practice_url: data.practice_url,
          expires_at: data.expires_at
        });
        return { success: true };
      } else {
        return { 
          success: false, 
          error: data.detail || data.message || 'Login failed' 
        };
      }
    } catch (error) {
      console.error('Login error:', error);
      
      // Customize error messages based on error type
      let errorMessage = 'Login failed. Please try again.';
      
      if (error.response?.status === 401) {
        errorMessage = 'Invalid username or password. Please check your credentials.';
      } else if (error.response?.status === 403) {
        errorMessage = 'Access denied. Please contact your administrator.';
      } else if (error.response?.status === 503) {
        errorMessage = 'ModMed services are temporarily unavailable. Please try again in a few minutes.';
      } else if (error.response?.status >= 500) {
        errorMessage = 'Server error. Please try again later.';
      } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        errorMessage = 'Request timed out. The server is taking too long to respond. Please try again.';
      } else if (!error.response) {
        errorMessage = 'Network error. Please check your connection.';
      }
      
      return { 
        success: false, 
        error: errorMessage
      };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      if (token) {
        await authService.logout();
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('session_token');
      setToken(null);
      setUser(null);
    }
  };

  const value = {
    user,
    token,
    login,
    logout,
    loading,
    isAuthenticated: !!user && !!token
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

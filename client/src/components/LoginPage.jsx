import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const LoginPage = () => {
  const [credentials, setCredentials] = useState({
    username: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { login, loading } = useAuth();
  const navigate = useNavigate();

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setCredentials(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user starts typing
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Basic validation
    if (!credentials.username || !credentials.password) {
      setError('Username and password are required');
      return;
    }

    const result = await login(credentials);
    
    if (result.success) {
      navigate('/'); // Redirect to main app
    } else {
      setError(result.error);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50 relative">
      <div className="w-full max-w-md">
        {/* Main login card */}
        <div 
          className="bg-white rounded-3xl shadow-lg border border-gray-100 flex flex-col"
          style={{ 
            paddingTop: '64px',
            paddingBottom: '64px',
            paddingLeft: '48px',
            paddingRight: '48px',
            height: '75vh',
            minHeight: '600px'
          }}
        >
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col justify-center">
            <div className="text-center mb-8 -mt-8">
              {/* Logo */}
              <div className="w-40 h-40 mx-auto mb-2">
                <img 
                  src="/logo.png" 
                  alt="UroAssist Logo" 
                  className="w-full h-full object-contain"
                />
              </div>
              <h1 className="text-2xl font-semibold text-gray-800">
                Log in to UroAssist
              </h1>
            </div>
            <div className="mb-6">
              <label htmlFor="username" className="block text-md font-medium-550 text-gray-900 mb-3">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                value={credentials.username}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white"
                placeholder=""
              />
            </div>
            
            <div className="mb-6">
              <div className="flex justify-between items-center mb-3">
                <label htmlFor="password" className="block text-md font-medium-550 text-gray-900">
                  Password
                </label>
                <button
                  type="button"
                  onClick={togglePasswordVisibility}
                  className="text-teal-600 hover:text-teal-700 focus:outline-none flex items-center text-base font-medium"
                >
                  <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {showPassword ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    )}
                  </svg>
                  Show
                </button>
              </div>
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={credentials.password}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white"
                placeholder=""
              />
            </div>

            <div className="flex items-center -mt-4 mb-2">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                className="h-5 w-5 text-teal-600 focus:ring-teal-500 border-gray-300 rounded"
              />
              <label htmlFor="remember-me" className="block text-base text-gray-900 ml-2">
                Remember me
              </label>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <div className="text-sm text-red-800">
                  {error}
                </div>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className={`w-full py-2 px-6 rounded-full text-white font-medium text-lg transition-colors mt-2 ${
                  loading 
                    ? 'bg-gray-400 cursor-not-allowed' 
                    : 'bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2'
                }`}
              >
              {loading ? (
                <div className="flex items-center justify-center">
                  <svg className="animate-spin h-5 w-5 text-white -ml-1 mr-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Signing in...
                </div>
              ) : (
                'Log in'
              )}
              </button>
            </div>
          </form>


        </div>
      </div>
    </div>
  );
};

export default LoginPage;
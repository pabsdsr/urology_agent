import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authService } from '../services/authService';

const LoginPage = () => {
  const [error, setError] = useState('');
  const { loginWithOutlookToken, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Handle Outlook OAuth callback token or error from URL
  useEffect(() => {
    const outlookToken = searchParams.get('outlook_token');
    const outlookError = searchParams.get('error');

    if (outlookToken) {
      setSearchParams({}, { replace: true });
      loginWithOutlookToken(outlookToken).then((result) => {
        if (result.success) {
          navigate('/');
        } else {
          setError(result.error);
        }
      });
    } else if (outlookError) {
      setSearchParams({}, { replace: true });
      setError(decodeURIComponent(outlookError));
    }
  }, [searchParams, loginWithOutlookToken, navigate, setSearchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <div className="w-full max-w-md">
        <div
          className="bg-white rounded-3xl shadow-lg border border-gray-100 flex flex-col items-center justify-center"
          style={{
            paddingTop: '64px',
            paddingBottom: '64px',
            paddingLeft: '48px',
            paddingRight: '48px',
            minHeight: '420px',
          }}
        >
          {/* Logo */}
          <div className="w-40 h-40 mb-4">
            <img
              src="/logo.png"
              alt="UroAssist Logo"
              className="w-full h-full object-contain"
            />
          </div>

          <h1 className="text-2xl font-semibold text-gray-800 mb-8">
            Log in to UroAssist
          </h1>

          {error && (
            <div className="w-full bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="text-sm text-red-800">{error}</div>
            </div>
          )}

          <button
            type="button"
            disabled={loading}
            onClick={() => authService.loginWithOutlook()}
            className="w-full py-2 px-6 rounded-full border border-gray-300 bg-white text-gray-700 font-medium text-lg transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <svg className="animate-spin h-5 w-5 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 23 23">
                <path fill="#f35325" d="M1 1h10v10H1z"/>
                <path fill="#81bc06" d="M12 1h10v10H12z"/>
                <path fill="#05a6f0" d="M1 12h10v10H1z"/>
                <path fill="#ffba08" d="M12 12h10v10H12z"/>
              </svg>
            )}
            {loading ? 'Signing in...' : 'Sign in with Microsoft'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;

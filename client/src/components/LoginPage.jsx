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
          className="bg-white rounded-3xl shadow-lg border border-gray-100 flex flex-col items-center px-10 py-10"
          style={{ minHeight: '520px' }}
        >
          {/* Logo */}
          <div className="w-50 h-50 mt-[5px] mb-2">
            <img
              src="/logo.png"
              alt="UroAssist Logo"
              className="w-full h-full object-contain"
            />
          </div>

          <div className="text-center mb-1">
            <h1 className="text-2xl font-semibold text-slate-900">
              Login To UroAssist
            </h1>
            <p className="mt-6 text-sm text-slate-500">
              Use your organization&apos;s Microsoft account to continue.
            </p>
          </div>

          {error && (
            <div className="w-full bg-red-50/90 border border-red-200 rounded-lg px-4 py-3 mb-6">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          <button
            type="button"
            disabled={loading}
            onClick={() => authService.loginWithOutlook()}
            className="w-full mt-1 mb-4 py-2 px-6 rounded-full border border-slate-200 bg-white text-slate-800 font-medium text-base transition-colors hover:bg-slate-50 hover:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
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

          <p className="mt-0 text-xs text-slate-400 text-center max-w-xs">
            By signing in, you confirm you are authorized to access protected health information for your organization.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;

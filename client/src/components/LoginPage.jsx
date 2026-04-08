import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { loginRequest } from '../authConfig';

const LoginPage = () => {
  const { instance } = useMsal();
  const activeAccount = instance.getActiveAccount();
  const [error, setError] = useState('');

  if (activeAccount) {
    return <Navigate to="/" replace />;
  }

  const handleLoginRedirect = () => {
    instance
      .loginRedirect(loginRequest)
      .catch((error) => {
        console.error(error);
        setError('Login failed. Please try again.');
      });
  };



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
            onClick={handleLoginRedirect}
            className="w-full mt-1 mb-2 py-2 px-6 rounded-full border border-slate-200 bg-white text-slate-800 font-medium text-base transition-colors hover:bg-slate-50 hover:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 flex items-center justify-center gap-3"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 23 23">
              <path fill="#f35325" d="M1 1h10v10H1z"/>
              <path fill="#81bc06" d="M12 1h10v10H12z"/>
              <path fill="#05a6f0" d="M1 12h10v10H1z"/>
              <path fill="#ffba08" d="M12 12h10v10H12z"/>
            </svg>
            Sign in with Microsoft
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

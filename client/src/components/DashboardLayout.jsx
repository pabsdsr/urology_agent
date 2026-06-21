import { useEffect, useState } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { useMsal } from '@azure/msal-react';
import { logoutSession } from '../services/authService.js';
import { msalConfig } from '../authConfig.js';

const navButtonClass = (active) =>
  `px-4 py-2 text-sm font-medium rounded-md transition-colors ${
    active
      ? "bg-teal-600 text-white"
      : "text-gray-700 bg-gray-100 hover:bg-teal-600 hover:text-white"
  }`;

const logoutButtonClass =
  "px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-teal-600 hover:text-white rounded-md transition-colors";

function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { instance } = useMsal();
  const [error, setError] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { label: "Chat", path: "/", active: location.pathname === "/" },
    { label: "Schedule", path: "/schedule", active: location.pathname === "/schedule" },
    {
      label: "Billing",
      path: "/billing/submissions",
      active: location.pathname.startsWith("/billing"),
    },
  ];

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogoutRedirect = async () => {
    setMobileMenuOpen(false);
    try {
      await logoutSession();
    } catch (e) {
      console.error(e);
    }
    instance
      .logoutRedirect({
        postLogoutRedirectUri: msalConfig.auth.postLogoutRedirectUri,
      })
      .catch((err) => {
        console.error(err);
        setError('Logout failed. Please try again.');
      });
  };

  const navigateTo = (path) => {
    navigate(path);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-2 md:py-1 gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <img
                src="/logo.png"
                alt="UroAssist Logo"
                className="w-10 h-10 md:w-14 md:h-14 shrink-0 object-contain"
              />
              <h1 className="text-lg md:text-2xl font-bold text-gray-900 truncate">
                UroAssist
              </h1>
            </div>

            <nav className="hidden md:flex items-center gap-2 shrink-0">
              {navLinks.map(({ label, path, active }) => (
                <button key={path} onClick={() => navigate(path)} className={navButtonClass(active)}>
                  {label}
                </button>
              ))}
              <button onClick={handleLogoutRedirect} className={logoutButtonClass}>
                Log out
              </button>
            </nav>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="md:hidden shrink-0 p-2 rounded-md text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-nav"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            >
              {mobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <nav id="mobile-nav" className="md:hidden border-t border-gray-200 bg-white px-4 py-3 space-y-1">
            {navLinks.map(({ label, path, active }) => (
              <button
                key={path}
                type="button"
                onClick={() => navigateTo(path)}
                className={`w-full text-left ${navButtonClass(active)}`}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={handleLogoutRedirect}
              className={`w-full text-left ${logoutButtonClass} py-2.5`}
            >
              Log out
            </button>
          </nav>
        )}
      </header>

      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-2">
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </p>
        </div>
      )}

      <main>
        <Outlet />
      </main>
    </div>
  );
}

export default DashboardLayout;

import React from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();

  const isChat = location.pathname === "/";
  const isSchedule = location.pathname === "/schedule";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top dashboard bar */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            {/* Left: logo + title */}
            <div className="flex items-center gap-3">
              <img
                src="/logo.png"
                alt="UroAssist Logo"
                className="w-10 h-10 object-contain"
              />
              <h1 className="text-xl font-bold text-gray-900">UroAssist</h1>
            </div>

            {/* Right: nav buttons + logout */}
            <nav className="flex items-center gap-2">
              <button
                onClick={() => navigate("/")}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  isChat
                    ? "bg-teal-600 text-white"
                    : "text-gray-700 bg-gray-100 hover:bg-teal-600 hover:text-white"
                }`}
              >
                Chat
              </button>
              <button
                onClick={() => navigate("/schedule")}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  isSchedule
                    ? "bg-teal-600 text-white"
                    : "text-gray-700 bg-gray-100 hover:bg-teal-600 hover:text-white"
                }`}
              >
                Schedule
              </button>
              <button
                onClick={logout}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-teal-600 hover:text-white rounded-md transition-colors"
              >
                Log out
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main>
        <Outlet />
      </main>
    </div>
  );
}

export default DashboardLayout;

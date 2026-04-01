import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import LoginPage from "./components/LoginPage";
import ProtectedRoute from "./components/ProtectedRoute";
import DashboardLayout from "./components/DashboardLayout";
import MainApp from "./components/MainApp";
import PractitionerSchedule from "./components/PractitionerSchedule";
import CallScheduleAdmin from "./components/CallScheduleAdmin";
import CallScheduleChangeLog from "./components/CallScheduleChangeLog";

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
            <Route index element={<MainApp />} />
            <Route path="schedule" element={<PractitionerSchedule />} />
            <Route path="call-schedule-admin" element={<ProtectedRoute requireAdmin>{<CallScheduleAdmin />}</ProtectedRoute>} />
            <Route path="call-schedule-change-log" element={<ProtectedRoute requireAdmin>{<CallScheduleChangeLog />}</ProtectedRoute>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
/** Backend session logout (MSAL sign-out is handled in DashboardLayout). */
import apiClient from "./apiClient.js";

export async function logoutSession() {
  const response = await apiClient.post("/auth/logout");
  return response.data;
}

export async function fetchCurrentUserProfile() {
  const response = await apiClient.get("/auth/me");
  return response.data;
}

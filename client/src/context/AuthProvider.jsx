import { useEffect, useMemo, useState } from "react";
import { InteractionStatus } from "@azure/msal-browser";
import { MsalProvider, useMsal } from "@azure/msal-react";
import { adminAppRole, billingProcessorAppRole, billingStaffAppRole } from "../authConfig.js";
import { msalInstance } from "../msalInstance.js";
import { redirectToLogin } from "../services/sessionLogout.js";
import { AuthContext } from "./authContext.js";

function parseRoles(claims) {
  if (!claims || typeof claims !== "object") return [];
  const raw = claims.roles;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string" && raw) return [raw];
  return [];
}

function AuthStateProvider({ children }) {
  const { instance, inProgress } = useMsal();
  const activeAccount = instance.getActiveAccount();

  useEffect(() => {
    window.addEventListener("auth:unauthorized", redirectToLogin);
    return () => window.removeEventListener("auth:unauthorized", redirectToLogin);
  }, []);

  const loading = inProgress !== InteractionStatus.None;
  const isAuthenticated = !!activeAccount;

  const user = useMemo(() => {
    if (!activeAccount) return null;
    const claims = activeAccount.idTokenClaims ?? {};
    const roles = parseRoles(claims);
    const billingStaff =
      roles.includes(billingStaffAppRole) || roles.includes(billingProcessorAppRole);
    const billingProcessor = roles.includes(billingProcessorAppRole);
    return {
      name: activeAccount.name,
      username: activeAccount.username,
      email: activeAccount.username,
      roles,
      is_admin: roles.includes(adminAppRole),
      billing_staff: billingStaff,
      billing_processor: billingProcessor,
      can_view_billing: billingStaff || billingProcessor,
    };
  }, [activeAccount]);

  const value = useMemo(
    () => ({
      isAuthenticated,
      loading,
      user,
      account: activeAccount,
    }),
    [isAuthenticated, loading, user, activeAccount]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default function AuthProvider({ children }) {
  const [initialized, setInitialized] = useState(false);
  const [initError, setInitError] = useState(false);

  useEffect(() => {
    msalInstance
      .initialize()
      .then(() => msalInstance.handleRedirectPromise())
      .then((response) => {
        if (response?.account) {
          msalInstance.setActiveAccount(response.account);
        } else {
          const accounts = msalInstance.getAllAccounts();
          if (accounts.length === 1) {
            msalInstance.setActiveAccount(accounts[0]);
          }
        }
      })
      .catch((err) => {
        console.error(err);
        setInitError(true);
      })
      .finally(() => {
        setInitialized(true);
      });
  }, []);

  if (!initialized) {
    return null;
  }

  // Don't render a silently-broken app when sign-in bootstrap fails.
  if (initError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md text-center">
          <h1 className="text-lg font-semibold text-gray-900">Sign-in failed to start</h1>
          <p className="mt-2 text-sm text-gray-600">
            We couldn't initialize authentication. Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  return (
    <MsalProvider instance={msalInstance}>
      <AuthStateProvider>{children}</AuthStateProvider>
    </MsalProvider>
  );
}

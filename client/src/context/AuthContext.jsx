import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
} from "react";
import { InteractionStatus } from "@azure/msal-browser";
import { MsalProvider, useMsal } from "@azure/msal-react";
import { adminAppRole } from "../authConfig.js";
import { msalInstance } from "../msalInstance.js";

const AuthContext = createContext(null);

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
  const loading = inProgress !== InteractionStatus.None;
  const isAuthenticated = !!activeAccount;

  const user = useMemo(() => {
    if (!activeAccount) return null;
    const claims = activeAccount.idTokenClaims ?? {};
    const roles = parseRoles(claims);
    const is_admin = roles.includes(adminAppRole);
    return {
      name: activeAccount.name,
      username: activeAccount.username,
      roles,
      is_admin,
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

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- useAuth is tied to AuthProvider
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

export const AuthProvider = ({ children }) => {
  const [initialized, setInitialized] = useState(false);

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
      })
      .finally(() => {
        setInitialized(true);
      });
  }, []);

  if (!initialized) {
    return null;
  }

  return (
    <MsalProvider instance={msalInstance}>
      <AuthStateProvider>{children}</AuthStateProvider>
    </MsalProvider>
  );
};
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { ROLE_TYPES, isAdminRole, isOfficeRole, normalizeRole } from "../constants/roles";
import {
  STORAGE_KEYS,
  clearStoredSession,
  persistAuthState,
  pickFirst,
} from "../utils/authStorage";

const initialAuthState = () => ({
  userName: pickFirst([STORAGE_KEYS.userName]),
  userGroup: pickFirst([STORAGE_KEYS.userGroup]),
  mobileNumber: pickFirst([STORAGE_KEYS.mobileNumber]),
});

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [authState, setAuthState] = useState(initialAuthState);

  const setAuthData = useCallback((updates) => {
    setAuthState((prev) => {
      const next = { ...prev, ...updates };
      persistAuthState(next);
      return next;
    });
  }, []);

  const clearAuth = useCallback(() => {
    setAuthState({ userName: "", userGroup: "", mobileNumber: "" });
    clearStoredSession();
  }, []);

  const normalizedRole = useMemo(() => normalizeRole(authState.userGroup), [authState.userGroup]);

  const value = useMemo(
    () => ({
      ...authState,
      normalizedRole,
      role: authState.userGroup || ROLE_TYPES.OFFICE,
      isAdmin: isAdminRole(authState.userGroup),
      isOfficeUser: isOfficeRole(authState.userGroup) || !authState.userGroup,
      setAuthData,
      clearAuth,
    }),
    [authState, normalizedRole, setAuthData, clearAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

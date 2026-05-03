import { useMemo } from "react";
import { ROLE_TYPES, isAdminRole, isOfficeRole, normalizeRole } from "../constants/roles";
import { useAuth } from "../context/AuthContext";

export function useUserRole() {
  const { userGroup, userName } = useAuth();

  const normalizedRole = useMemo(() => normalizeRole(userGroup), [userGroup]);

  const resolvedRole = useMemo(() => {
    if (isAdminRole(userGroup)) return ROLE_TYPES.ADMIN;
    if (isOfficeRole(userGroup)) return ROLE_TYPES.OFFICE;
    return userGroup || ROLE_TYPES.OFFICE;
  }, [userGroup]);

  return {
    role: resolvedRole,
    normalizedRole,
    userName,
    isAdmin: isAdminRole(userGroup),
    isOfficeUser: isOfficeRole(userGroup) || !userGroup,
  };
}

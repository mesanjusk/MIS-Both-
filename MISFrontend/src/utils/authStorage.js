/**
 * Auth storage utility
 *
 * Strategy: write to BOTH old keys (User_name, User_group) and new keys
 * (mis_userName, mis_userGroup) so that legacy code across the app that
 * still reads the old keys keeps working without needing mass refactoring.
 *
 * The repairAuthStorage() function fixes the broken state left by the
 * previous migration that deleted User_name/User_group — existing logged-in
 * users who lost those keys get them restored from the new keys.
 */

const TOKEN_KEY = "mis_token";
const LEGACY_TOKEN_KEYS = ["token", "authToken", "access_token", "ACCESS_TOKEN"];

export const STORAGE_KEYS = {
  userName: "mis_userName",
  userGroup: "mis_userGroup",
  mobileNumber: "mis_mobileNumber",
};

// Legacy keys that many pages across the app still read directly
const LEGACY_WRITE_KEYS = {
  userName: "User_name",
  userGroup: "User_group",
  mobileNumber: "Mobile_number",
};

/**
 * Repair broken localStorage state for users who were already logged in
 * when the bad migration ran. That migration:
 *   1. Moved User_name → mis_userName
 *   2. DELETED User_name
 * So these users have mis_userName set but User_name missing.
 * home.jsx reads User_name and finds null → redirects to login → blink loop.
 *
 * Fix: if mis_userName exists but User_name is missing, restore User_name.
 * This runs every boot and is a no-op once both keys are in sync.
 */
export function repairAuthStorage() {
  const newUserName  = localStorage.getItem(STORAGE_KEYS.userName);
  const oldUserName  = localStorage.getItem(LEGACY_WRITE_KEYS.userName);
  const newUserGroup = localStorage.getItem(STORAGE_KEYS.userGroup);
  const oldUserGroup = localStorage.getItem(LEGACY_WRITE_KEYS.userGroup);

  // Restore legacy keys from new keys if missing
  if (newUserName && !oldUserName)  localStorage.setItem(LEGACY_WRITE_KEYS.userName,  newUserName);
  if (newUserGroup && !oldUserGroup) localStorage.setItem(LEGACY_WRITE_KEYS.userGroup, newUserGroup);

  // Restore new keys from legacy keys if missing (first-time users / incognito)
  if (oldUserName && !newUserName)  localStorage.setItem(STORAGE_KEYS.userName,  oldUserName);
  if (oldUserGroup && !newUserGroup) localStorage.setItem(STORAGE_KEYS.userGroup, newUserGroup || oldUserGroup);

  // Token: migrate from old keys if mis_token missing
  if (!localStorage.getItem(TOKEN_KEY)) {
    for (const key of LEGACY_TOKEN_KEYS) {
      const val = localStorage.getItem(key);
      if (val) { localStorage.setItem(TOKEN_KEY, val); break; }
    }
  }
  LEGACY_TOKEN_KEYS.forEach((k) => localStorage.removeItem(k));
}

/** @deprecated Use repairAuthStorage instead — kept for backward compat */
export function migrateAuthStorage() {
  repairAuthStorage();
}

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setStoredToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY);
}

/** Reads the first key that has a value in localStorage */
export function pickFirst(keys) {
  for (const key of keys) {
    if (!key) continue;
    const val = localStorage.getItem(key);
    if (val) return val;
  }
  return "";
}

/** Write auth state to BOTH new and legacy keys so all pages work */
export function persistAuthState(nextState = {}) {
  const { userName = "", userGroup = "", mobileNumber = "" } = nextState;

  if (userName) {
    localStorage.setItem(STORAGE_KEYS.userName,       userName);
    localStorage.setItem(LEGACY_WRITE_KEYS.userName,  userName); // legacy: User_name
  } else {
    localStorage.removeItem(STORAGE_KEYS.userName);
    localStorage.removeItem(LEGACY_WRITE_KEYS.userName);
  }

  if (userGroup) {
    localStorage.setItem(STORAGE_KEYS.userGroup,       userGroup);
    localStorage.setItem(LEGACY_WRITE_KEYS.userGroup,  userGroup); // legacy: User_group
  } else {
    localStorage.removeItem(STORAGE_KEYS.userGroup);
    localStorage.removeItem(LEGACY_WRITE_KEYS.userGroup);
  }

  if (mobileNumber) {
    localStorage.setItem(STORAGE_KEYS.mobileNumber,      mobileNumber);
    localStorage.setItem(LEGACY_WRITE_KEYS.mobileNumber, mobileNumber);
  } else {
    localStorage.removeItem(STORAGE_KEYS.mobileNumber);
    localStorage.removeItem(LEGACY_WRITE_KEYS.mobileNumber);
  }
}

export function clearStoredSession() {
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
  Object.values(LEGACY_WRITE_KEYS).forEach((key) => localStorage.removeItem(key));
  clearStoredToken();
}

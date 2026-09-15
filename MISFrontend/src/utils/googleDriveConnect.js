import axios from "../apiClient";

/**
 * Start the Google Drive connection flow.
 *
 * The consent URL has to be fetched over the authenticated API client: it
 * carries a single-use state the server issues only for a request it has
 * authorized, and a plain browser navigation to the backend could not present
 * a token. Connecting the installation's Drive account is an admin action, so
 * a non-admin simply gets false back and the caller carries on.
 *
 * @param {string} returnTo where to land after the consent screen
 * @returns {Promise<boolean>} true if the browser is being redirected
 */
export async function startGoogleDriveConnect(returnTo = window.location.href) {
  try {
    const res = await axios.get("/api/google-drive/auth-url", { params: { returnTo } });
    const authUrl = res?.data?.authUrl;
    if (!authUrl) return false;
    window.location.href = authUrl;
    return true;
  } catch (error) {
    // 403 for a non-admin, or the endpoint is unreachable — either way there is
    // nothing this user can do here.
    console.error("Could not start Google Drive connection:", error);
    return false;
  }
}

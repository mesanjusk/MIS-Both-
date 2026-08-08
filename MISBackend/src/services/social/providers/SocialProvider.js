const AppError = require('../../../utils/AppError');

/**
 * SocialProvider — base interface every platform provider implements.
 * Methods a provider doesn't support (per that platform's actual API) must
 * be left unimplemented here so callers get a clear "not supported" error
 * instead of a provider silently no-oping ("Do not force unsupported
 * operations" — see CLAUDE.md task spec).
 */
class SocialProvider {
  constructor(platform) {
    this.platform = platform;
  }

  /** True when the developer credentials (client id/secret/redirect) for this platform are set. */
  isConfigured() {
    return false;
  }

  /** Build the OAuth authorization URL the browser should be redirected to. */
  getAuthUrl(_state) {
    throw new AppError(`${this.platform}: connect is not implemented`, 501);
  }

  /** Exchange the OAuth callback (code/params) for account(s) + tokens; persists SocialAccount rows. */
  async handleCallback(_query, _context) {
    throw new AppError(`${this.platform}: callback is not implemented`, 501);
  }

  /** Refresh an expiring access token; updates and returns the SocialAccount doc. */
  async refreshToken(_account) {
    throw new AppError(`${this.platform} does not support token refresh`, 400);
  }

  /** Revoke/clear stored credentials for this account. */
  async disconnect(account) {
    account.accessTokenEncrypted = null;
    account.refreshTokenEncrypted = null;
    account.status = 'DISCONNECTED';
    await account.save();
    return account;
  }

  /** Make a real API call to confirm the stored token still works. Updates lastValidatedAt/status/lastError. */
  async validateConnection(_account) {
    throw new AppError(`${this.platform}: connection validation is not implemented`, 501);
  }

  async publishPost(_account, _post, _assets) {
    throw new AppError(`${this.platform} does not support text-only posts`, 400);
  }

  async publishPhoto(_account, _post, _assets) {
    throw new AppError(`${this.platform} does not support photo posts`, 400);
  }

  async publishVideo(_account, _post, _assets) {
    throw new AppError(`${this.platform} does not support video posts`, 400);
  }

  /** Poll processing/publish status for an async platform upload (e.g. IG container, YouTube processing). */
  async getPublishStatus(_account, _platformPostId) {
    throw new AppError(`${this.platform}: publish status polling is not implemented`, 501);
  }

  async getAnalytics(_account, _platformPostId) {
    throw new AppError(`${this.platform}: analytics are not implemented`, 501);
  }

  async deletePost(_account, _platformPostId) {
    throw new AppError(`${this.platform} does not support deleting a published post via API`, 400);
  }
}

module.exports = SocialProvider;

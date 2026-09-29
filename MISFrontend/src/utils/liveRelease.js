/* global __APP_RELEASE__ */

// Vite substitutes this at build time. A preview with no merged-PR metadata
// displays its commit instead of incorrectly claiming a production PR.
export const LIVE_RELEASE = typeof __APP_RELEASE__ === 'undefined'
  ? { label: 'Local build', pr: null, sha: '' }
  : __APP_RELEASE__;

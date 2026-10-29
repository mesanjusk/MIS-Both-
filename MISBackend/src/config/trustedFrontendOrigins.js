// Vercel creates a new sbsgondia deployment host after each commit. Allow only
// deployment URLs for THIS project's Vercel team, not arbitrary vercel.app
// domains. Authentication and application permissions remain mandatory.
const OWN_VERCEL_DEPLOYMENT = /^sbsgondia-[a-z0-9-]+-sanju-sks-projects\.vercel\.app$/i;

function isTrustedProjectDeploymentOrigin(origin) {
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' &&
      !url.port &&
      url.origin === origin &&
      OWN_VERCEL_DEPLOYMENT.test(url.hostname);
  } catch {
    return false;
  }
}

module.exports = { isTrustedProjectDeploymentOrigin };

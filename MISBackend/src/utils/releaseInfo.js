/**
 * The deployed commit, when the platform tells us what it is.
 *
 * Purpose is narrow: after a deploy, confirm from outside that the running
 * service is the build you think it is. "Is it deployed yet?" is otherwise
 * answered by refreshing a dashboard and hoping.
 *
 * Only the short commit SHA is exposed, and only if the host supplies it.
 * A SHA is not a secret — it names a commit in a repository you already need
 * access to read. Nothing else about the environment is surfaced here: not the
 * database state, not versions, not configuration. A health endpoint is
 * unauthenticated, so everything on it is public by definition, and the
 * temptation to add "just the DB status" is how health endpoints turn into
 * reconnaissance.
 */

// Render sets RENDER_GIT_COMMIT. The others are the usual equivalents on
// Vercel, Heroku and generic CI, so this keeps working if the host changes.
const COMMIT_VARS = [
  'RENDER_GIT_COMMIT',
  'VERCEL_GIT_COMMIT_SHA',
  'SOURCE_VERSION',
  'GIT_COMMIT',
  'COMMIT_SHA',
];

const SHORT_SHA_LENGTH = 7;

/** A 7-character commit SHA, or '' when the platform did not provide one. */
function getReleaseId() {
  for (const name of COMMIT_VARS) {
    const value = String(process.env[name] || '').trim();
    // Only ever a hex SHA. Anything else is not a commit id, and passing it
    // through would mean echoing an arbitrary environment value to the world.
    if (/^[0-9a-f]{7,40}$/i.test(value)) {
      return value.slice(0, SHORT_SHA_LENGTH).toLowerCase();
    }
  }
  return '';
}

/** The health payload. `release` is omitted entirely when unknown. */
function getHealthPayload() {
  const release = getReleaseId();
  return { ok: true, service: 'MIS Backend', ...(release ? { release } : {}) };
}

module.exports = { getReleaseId, getHealthPayload, COMMIT_VARS };

// Build metadata must describe the exact frontend bundle, not the backend
// deployment (the two can be on different commits during rollout).
export function extractPrNumber(message = '') {
  const matches = [...String(message).matchAll(/(?:\(\s*#|\bPR\s*#|\bpull request\s*#)(\d{1,7})\b/gi)];
  return matches.length ? Number(matches[matches.length - 1][1]) : null;
}

export function resolveReleaseInfo({ env = {}, message = '', sha = '', version = '0.0.0' } = {}) {
  const suppliedSha = String(env.VERCEL_GIT_COMMIT_SHA || env.GITHUB_SHA || sha || '').trim();
  const commit = /^[0-9a-f]{7,40}$/i.test(suppliedSha) ? suppliedSha.slice(0, 7).toLowerCase() : '';
  const title = String(env.VERCEL_GIT_COMMIT_MESSAGE || message || '');
  const pr = extractPrNumber(title);
  return {
    version: commit || version,
    sha: commit,
    pr,
    label: pr ? `PR #${pr}` : commit ? `Commit ${commit}` : 'Local build',
  };
}

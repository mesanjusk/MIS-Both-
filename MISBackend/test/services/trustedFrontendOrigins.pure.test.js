const { isTrustedProjectDeploymentOrigin } = require('../../src/config/trustedFrontendOrigins');

describe('project-scoped Vercel origins', () => {
  test('permits the project production and preview deployment hosts', () => {
    expect(isTrustedProjectDeploymentOrigin(
      'https://sbsgondia-9f6fcvl8k-sanju-sks-projects.vercel.app'
    )).toBe(true);
    expect(isTrustedProjectDeploymentOrigin(
      'https://sbsgondia-somepreview-sanju-sks-projects.vercel.app'
    )).toBe(true);
  });

  test('rejects arbitrary Vercel projects, deceptive suffixes, and insecure origins', () => {
    expect(isTrustedProjectDeploymentOrigin('https://anotherapp-sanju-sks-projects.vercel.app')).toBe(false);
    expect(isTrustedProjectDeploymentOrigin('https://sbsgondia-abc-otherteam.vercel.app')).toBe(false);
    expect(isTrustedProjectDeploymentOrigin('https://sbsgondia-abc-sanju-sks-projects.vercel.app.evil.com')).toBe(false);
    expect(isTrustedProjectDeploymentOrigin('http://sbsgondia-abc-sanju-sks-projects.vercel.app')).toBe(false);
    expect(isTrustedProjectDeploymentOrigin('https://sbsgondia-abc-sanju-sks-projects.vercel.app:8443')).toBe(false);
  });
});

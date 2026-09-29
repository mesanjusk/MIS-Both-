import { describe, expect, it } from 'vitest';
import { extractPrNumber, resolveReleaseInfo } from './releaseMetadata';

describe('live release metadata', () => {
  it('reads the merged PR number from a squash title or merge commit', () => {
    expect(extractPrNumber('Archive quick MIS order and badge (#282)')).toBe(282);
    expect(extractPrNumber('Merge pull request #283 from feature/order')).toBe(283);
    expect(extractPrNumber('PR #284: fix permissions')).toBe(284);
  });

  it('never mistakes an unrelated issue number for a deployed PR', () => {
    expect(extractPrNumber('Fixes issue #12')).toBeNull();
    expect(extractPrNumber('Local branch build')).toBeNull();
  });

  it('pairs the correct frontend SHA with the merged PR', () => {
    expect(resolveReleaseInfo({
      env: {
        VERCEL_GIT_COMMIT_SHA: 'abcdef0123456789abcdef0123456789abcdef01',
        VERCEL_GIT_COMMIT_MESSAGE: 'Archive quick MIS order and badge (#282)',
      },
      version: '0.0.0',
    })).toEqual({
      version: 'abcdef0', sha: 'abcdef0', pr: 282, label: 'PR #282',
    });
  });

  it('shows a commit instead of an inaccurate PR on preview builds', () => {
    expect(resolveReleaseInfo({
      env: {}, message: 'Work in progress', sha: '1234567890abcdef', version: '0.0.0',
    })).toEqual({
      version: '1234567', sha: '1234567', pr: null, label: 'Commit 1234567',
    });
  });
});

import { describe, expect, test } from 'vitest';
import { getWorkflowLocalFolderPath } from './workflowLocalFolder';

describe('Workflow local-folder resolver', () => {
  const root = '\\\\OFFICE-SERVER\\SharedOrders';

  test('opens the containing archive folder, not the .cdr file itself', () => {
    expect(getWorkflowLocalFolderPath({
      networkShareRoot: root,
      relativePath: 'Archive\\September 2026\\29\\Final\\901 - Client.cdr',
      anchorFound: true,
    })).toBe('\\\\OFFICE-SERVER\\SharedOrders\\Archive\\September 2026\\29\\Final');
  });

  test('a file directly beneath the mapped share opens that configured share root', () => {
    expect(getWorkflowLocalFolderPath({
      networkShareRoot: root, relativePath: '901 - Client.cdr', anchorFound: true,
    })).toBe(root);
  });

  test('handles Windows drive shares and forward-slash relative paths', () => {
    expect(getWorkflowLocalFolderPath({
      networkShareRoot: 'D:\\Google Drive',
      relativePath: 'Archive/2026/Final/Order.pdf',
      anchorFound: true,
    })).toBe('D:\\Google Drive\\Archive\\2026\\Final');
  });

  test('never silently opens the wrong folder when Drive cannot resolve an anchored path', () => {
    expect(getWorkflowLocalFolderPath({
      networkShareRoot: root, relativePath: 'file.cdr', anchorFound: false,
    })).toBe('');
    expect(getWorkflowLocalFolderPath({
      networkShareRoot: root, relativePath: '', driveLookupFailed: true,
    })).toBe('');
    expect(getWorkflowLocalFolderPath({ relativePath: 'file.cdr', anchorFound: true })).toBe('');
  });

  test('rejects traversal, absolute paths and unsafe path segments', () => {
    for (const relativePath of [
      '..\\Windows\\file.txt', 'Folder\\..\\file.cdr',
      'C:\\Others\\file.cdr', '\\\\SERVER\\Elsewhere\\file.cdr',
      'Folder\\bad:file.cdr',
    ]) {
      expect(getWorkflowLocalFolderPath({
        networkShareRoot: root, relativePath, anchorFound: true,
      })).toBe('');
    }
  });
});

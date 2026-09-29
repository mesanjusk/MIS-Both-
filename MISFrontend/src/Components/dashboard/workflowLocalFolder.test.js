import { describe, expect, test } from 'vitest';
import { getWorkflowLocalFolderPath } from './workflowLocalFolder';

describe('Workflow local-folder resolver', () => {
  const root = String.raw\`\\OFFICE-SERVER\SharedOrders\`;
  test('opens the containing archive folder, not the .cdr file itself', () => {
    expect(getWorkflowLocalFolderPath({
      networkShareRoot: root,
      relativePath: String.raw\`Archive\September 2026\29\Final\901 - Client.cdr\`,
      anchorFound: true,
    })).toBe(String.raw\`\\OFFICE-SERVER\SharedOrders\Archive\September 2026\29\Final\`);
  });

  test('a file directly beneath the mapped share opens that configured share root', () => {
    expect(getWorkflowLocalFolderPath({
      networkShareRoot: root, relativePath: '901 - Client.cdr', anchorFound: true,
    })).toBe(root);
  });

  test('handles Windows drive shares and forward-slash relative paths', () => {
    expect(getWorkflowLocalFolderPath({
      networkShareRoot: String.raw\`D:\Google Drive\`,
      relativePath: 'Archive/2026/Final/Order.pdf',
      anchorFound: true,
    })).toBe(String.raw\`D:\Google Drive\Archive\2026\Final\`);
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
      String.raw\`..\Windows\file.txt\`, String.raw\`Folder\..\file.cdr\`,
      String.raw\`C:\Others\file.cdr\`, String.raw\`\\SERVER\Elsewhere\file.cdr\`,
      String.raw\`Folder\bad:file.cdr\`,
    ]) {
      expect(getWorkflowLocalFolderPath({
        networkShareRoot: root, relativePath, anchorFound: true,
      })).toBe('');
    }
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FileLocalFolderButton } from './DesignFilesWidget';
import { copyPathToClipboard, launchMisFileUrl } from '../../utils/localFileLauncher';
import toast from 'react-hot-toast';

const api = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../../apiClient', () => ({ default: { get: api.get } }));
vi.mock('../../utils/localFileLauncher', async (importOriginal) => ({
  ...await importOriginal(),
  copyPathToClipboard: vi.fn().mockResolvedValue(true),
  launchMisFileUrl: vi.fn().mockReturnValue(true),
}));
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const file = { fileId: 'drive-file-901', fileName: '901 - Client.cdr', stageNumber: 5 };

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: { success: true, result: {
    networkShareRoot: '\\\\OFFICE-SERVER\\SharedOrders',
    relativePath: 'Archive\\Sep 2026\\29\\Final\\901 - Client.cdr',
    anchorFound: true,
  } } });
});

describe('Workflow file-card local folder action', () => {
  it('opens the resolved containing folder via Orders Windows opener and does not select the card', async () => {
    const onSelect = vi.fn();
    render(<div onClick={onSelect}><FileLocalFolderButton file={file} /></div>);
    fireEvent.click(screen.getByRole('button', { name: 'Open local folder for 901 - Client.cdr' }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      '/api/network-files/resolve', { params: { fileId: 'drive-file-901' }, cache: false },
    ));
    const expected = '\\\\OFFICE-SERVER\\SharedOrders\\Archive\\Sep 2026\\29\\Final';
    await waitFor(() => expect(launchMisFileUrl).toHaveBeenCalledWith(expected, { select: false }));
    expect(copyPathToClipboard).toHaveBeenCalledWith(expected);
    expect(onSelect).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalled();
  });

  it('does not attempt a launch if Drive could not identify the mapped anchor', async () => {
    api.get.mockResolvedValue({ data: { success: true, result: {
      networkShareRoot: '\\\\OFFICE-SERVER\\SharedOrders',
      relativePath: '901 - Client.cdr',
      anchorFound: false,
    } } });
    render(<FileLocalFolderButton file={file} />);
    fireEvent.click(screen.getByRole('button', { name: /Open local folder for/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(launchMisFileUrl).not.toHaveBeenCalled();
  });

  it('does not show a misleading folder action for an unknown file ID', () => {
    render(<FileLocalFolderButton file={{ fileName: 'no-id.cdr' }} />);
    expect(screen.queryByRole('button', { name: /Open local folder/i })).not.toBeInTheDocument();
  });
});

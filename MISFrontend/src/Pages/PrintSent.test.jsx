import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import api from '../apiClient';
import PrintSent from './PrintSent';

vi.mock('../apiClient', () => ({ default: { get: vi.fn(), patch: vi.fn() } }));

beforeEach(() => vi.resetAllMocks());

test('shows seven dates, opens recipient folders, and keeps each email’s attachments together', async () => {
  const dates = ['2026-11-25', '2026-11-24', '2026-11-23', '2026-11-22', '2026-11-21', '2026-11-20', '2026-11-19'];
  api.get.mockResolvedValueOnce({ data: { dates, folders: [
    { date: dates[0], email: 'gondia@example.com', name: 'Gondia Press', count: 1 },
    { date: dates[0], email: 'nagpur@example.com', name: 'Nagpur Press', count: 2 },
    { date: dates[1], email: 'gondia@example.com', name: 'Gondia Press', count: 1 },
  ] } }).mockResolvedValueOnce({ data: { hasMore: false, result: [{
    _id: 'mail-1', sentAt: '2026-11-25T04:30:00.000Z',
    attachments: [{ originalName: 'Poster.pdf', thumbnail: 'aW1n' }, { originalName: 'Flyer.cdr' }],
  }, {
    _id: 'mail-2', sentAt: '2026-11-25T04:00:00.000Z', attachments: [],
  }] } });

  render(<PrintSent />);
  const dateList = await screen.findByRole('list', { name: 'Print dates' });
  expect(within(dateList).getAllByRole('button')).toHaveLength(7);
  fireEvent.click(within(dateList).getByRole('button', { name: /25 Nov.*2026.*3 emails/ }));
  expect(screen.getByRole('button', { name: /Nagpur Press.*2 emails/ })).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: /Gondia Press.*1 email/ }));
  expect(await screen.findByText('Poster.pdf')).toBeInTheDocument();
  expect(screen.getByText('Flyer.cdr')).toBeInTheDocument();
  expect(screen.getByText('No attachments')).toBeInTheDocument();
  expect(screen.getByAltText('')).toHaveAttribute('src', 'data:image/jpeg;base64,aW1n');
  expect(api.get).toHaveBeenLastCalledWith('/api/gmail/print-sent/messages',
    expect.objectContaining({ params: { date: dates[0], recipient: 'gondia@example.com', page: 1, status: 'all' } }));

  fireEvent.click(screen.getByRole('button', { name: 'Recipients' }));
  fireEvent.click(screen.getByRole('button', { name: 'Dates' }));
  fireEvent.click(within(screen.getByRole('list', { name: 'Print dates' })).getByRole('button', { name: /23 Nov.*2026/ }));
  expect(screen.getByText('No print emails sent on this date.')).toBeInTheDocument();
});

test('tracks attachments independently and can undo a received mark on an older job', async () => {
  const date = '2026-10-01';
  const email = 'gondia@example.com';
  const attachments = [{ originalName: 'Poster.pdf', received: true }, { originalName: 'Flyer.cdr' }];
  api.get.mockImplementation(async (path, { params }) => {
    const matches = attachments.some(({ received }) => (received === true) === (params.status === 'received'));
    return { data: path.endsWith('/folders')
      ? { dates: matches ? [date] : [], folders: matches ? [{ date, email, name: 'Gondia Press', count: 1 }] : [] }
      : { hasMore: false, result: matches ? [{ _id: 'mail-1', sentAt: `${date}T03:00:00Z`, attachments }] : [] } };
  });
  api.patch.mockImplementation(async (path, { received }) => {
    attachments[Number(path.split('/').at(-1))].received = received;
    return { data: { received } };
  });
  render(<PrintSent />);
  fireEvent.click(screen.getByRole('tab', { name: 'Pending' }));
  fireEvent.click(await screen.findByRole('button', { name: /1 Oct.*2026/ }));
  fireEvent.click(await screen.findByRole('button', { name: /Gondia Press/ }));
  const flyer = await screen.findByRole('checkbox', { name: /Flyer/ });
  expect(flyer).not.toBeChecked();
  expect(screen.queryByRole('checkbox', { name: /Poster/ })).not.toBeInTheDocument();
  fireEvent.click(flyer);
  expect(await screen.findByText('No pending attachments in this folder.')).toBeInTheDocument();
  expect(api.patch).toHaveBeenLastCalledWith('/api/gmail/print-sent/messages/mail-1/attachments/1', { received: true });

  fireEvent.click(screen.getByRole('tab', { name: 'Received' }));
  expect(await screen.findByRole('checkbox', { name: /Flyer/ })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: /Poster/ })).toBeChecked();
  fireEvent.click(screen.getByRole('checkbox', { name: /Flyer/ }));
  expect(await screen.findByRole('checkbox', { name: /Poster/ })).toBeChecked();
  expect(screen.queryByRole('checkbox', { name: /Flyer/ })).not.toBeInTheDocument();
  expect(api.patch).toHaveBeenLastCalledWith('/api/gmail/print-sent/messages/mail-1/attachments/1', { received: false });
});

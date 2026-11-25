import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import api from '../apiClient';
import PrintSent from './PrintSent';

vi.mock('../apiClient', () => ({ default: { get: vi.fn() } }));

test('shows seven dates, opens recipient folders, and keeps each email’s attachments together', async () => {
  const dates = ['2026-11-25', '2026-11-24', '2026-11-23', '2026-11-22', '2026-11-21', '2026-11-20', '2026-11-19'];
  api.get.mockResolvedValueOnce({ data: { dates, folders: [
    { date: dates[0], email: 'gondia@example.com', name: 'Gondia Press', count: 1 },
    { date: dates[0], email: 'nagpur@example.com', name: 'Nagpur Press', count: 2 },
    { date: dates[1], email: 'gondia@example.com', name: 'Gondia Press', count: 1 },
  ] } }).mockResolvedValueOnce({ data: { hasMore: false, result: [{
    _id: 'mail-1', sentAt: '2026-11-25T04:30:00.000Z',
    attachments: [{ originalName: 'Poster.pdf', thumbnail: 'aW1n' }, { originalName: 'Flyer.cdr' }],
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
  expect(screen.getByAltText('')).toHaveAttribute('src', 'data:image/jpeg;base64,aW1n');
  expect(api.get).toHaveBeenLastCalledWith('/api/gmail/print-sent/messages',
    expect.objectContaining({ params: { date: dates[0], recipient: 'gondia@example.com', page: 1 } }));

  fireEvent.click(screen.getByRole('button', { name: 'Recipients' }));
  fireEvent.click(screen.getByRole('button', { name: 'Dates' }));
  fireEvent.click(within(screen.getByRole('list', { name: 'Print dates' })).getByRole('button', { name: /23 Nov.*2026/ }));
  expect(screen.getByText('No print emails sent on this date.')).toBeInTheDocument();
});

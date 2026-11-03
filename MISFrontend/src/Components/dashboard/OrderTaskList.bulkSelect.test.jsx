import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import OrderTaskList from './OrderTaskList';

const tasks = [
  { orderId: 'o-1', orderNumber: 41, customerName: 'Customer A', stage: 'print', assignedTo: 'Unassigned' },
  { orderId: 'o-2', orderNumber: 42, customerName: 'Customer B', stage: 'fitting', assignedTo: 'Worker' },
];

describe('Workflow order selection', () => {
  it('lets operators select individual cards for a bulk stage move', () => {
    const onToggleSelect = vi.fn();
    render(<OrderTaskList tasks={tasks} view="stack" selectionMode
      selectedOrderIds={new Set(['o-2'])} onToggleSelect={onToggleSelect} />);
    const first = screen.getByRole('checkbox', { name: 'Select order #41' });
    const second = screen.getByRole('checkbox', { name: 'Select order #42' });
    expect(first).not.toBeChecked();
    expect(second).toBeChecked();
    fireEvent.click(first);
    expect(onToggleSelect).toHaveBeenCalledWith('o-1');
  });

  it('also offers selection in By User cards and hides it until enabled', () => {
    const onToggleSelect = vi.fn();
    const { rerender } = render(<OrderTaskList tasks={tasks} view="card" />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    rerender(<OrderTaskList tasks={tasks} view="card" selectionMode
      selectedOrderIds={new Set()} onToggleSelect={onToggleSelect} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select order #42' }));
    expect(onToggleSelect).toHaveBeenCalledWith('o-2');
  });
});

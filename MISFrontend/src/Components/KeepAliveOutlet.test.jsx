import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';

import KeepAliveOutlet from './KeepAliveOutlet';

vi.mock('./PageToggleGuard', () => ({
  default: ({ children }) => children,
}));

function Navigation() {
  const navigate = useNavigate();
  return (
    <div>
      <button onClick={() => navigate('/one')}>One</button>
      <button onClick={() => navigate('/two')}>Two</button>
    </div>
  );
}

function StatefulPage({ name, onMount }) {
  const [value, setValue] = useState('');

  useEffect(() => {
    onMount(name);
  }, [name, onMount]);

  return (
    <label>
      {name}
      <input
        aria-label={`${name}-input`}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </label>
  );
}

describe('KeepAliveOutlet', () => {
  test('preserves mounted route state when navigating away and back', () => {
    const mounts = { one: 0, two: 0 };
    const onMount = vi.fn((name) => {
      mounts[name] += 1;
    });

    render(
      <MemoryRouter initialEntries={['/one']}>
        <Navigation />
        <Routes>
          <Route element={<KeepAliveOutlet />}>
            <Route path="/one" element={<StatefulPage name="one" onMount={onMount} />} />
            <Route path="/two" element={<StatefulPage name="two" onMount={onMount} />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('one-input'), { target: { value: 'keep me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Two' }));
    fireEvent.change(screen.getByLabelText('two-input'), { target: { value: 'second page' } });
    fireEvent.click(screen.getByRole('button', { name: 'One' }));

    expect(screen.getByLabelText('one-input')).toHaveValue('keep me');
    expect(screen.getByLabelText('two-input')).toHaveValue('second page');
    expect(mounts.one).toBe(1);
    expect(mounts.two).toBe(1);
  });
});

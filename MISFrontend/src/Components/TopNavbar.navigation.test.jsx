import { describe, expect, test } from 'vitest';
import { shouldShowGlobalBack } from './TopNavbar';
import { ROUTES } from '../constants/routes';

describe('TopNavbar global back navigation', () => {
  test('hides the back button on Home and Dashboard aliases', () => {
    expect(shouldShowGlobalBack(ROUTES.HOME)).toBe(false);
    expect(shouldShowGlobalBack(ROUTES.DASHBOARD)).toBe(false);
  });

  test('shows the back button on ledger and other authenticated screens', () => {
    expect(shouldShowGlobalBack(ROUTES.LEDGER)).toBe(true);
    expect(shouldShowGlobalBack('/accounts/bank-reconciliation/example')).toBe(true);
    expect(shouldShowGlobalBack('/orders/board')).toBe(true);
  });
});

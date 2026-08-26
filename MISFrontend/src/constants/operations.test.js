import { describe, expect, it } from 'vitest';

import {
  attendanceColor, stateColor, categoryLabel, ownerRoleLabel,
  describeUserRole, formatWeekDays, BUCKET_META,
} from './operations';
import { SIDEBAR_GROUPS } from './sidebarMenu';
import { ROUTES } from './routes';

describe('operations display helpers', () => {
  it('colours attendance so absence reads as a problem and presence does not', () => {
    expect(attendanceColor('Present')).toBe('success');
    expect(attendanceColor('Absent')).toBe('error');
    expect(attendanceColor('Late')).toBe('warning');
  });

  it('falls back to a neutral colour for a status it does not know', () => {
    // The backend may add a status before this table does; an unknown value
    // must render plainly rather than crash the chip.
    expect(attendanceColor('Sabbatical')).toBe('default');
    expect(stateColor(undefined)).toBe('default');
  });

  it('labels the two categories the fallback rules hinge on', () => {
    expect(categoryLabel('outside_logistics')).toBe('Outside Logistics');
    expect(categoryLabel('inside_store')).toBe('Inside Store');
  });

  it('labels chain roles the way the chain resolves them', () => {
    expect(ownerRoleLabel('primary')).toBe('Primary');
    expect(ownerRoleLabel('backup1')).toBe('Backup 1');
    expect(ownerRoleLabel('backup2')).toBe('Backup 2');
    expect(ownerRoleLabel('escalated')).toBe('Escalated');
  });

  it('describes a role from whichever halves are configured', () => {
    expect(describeUserRole({ priority: 'P1', roleTitle: 'Design Head' })).toBe('P1 — Design Head');
    expect(describeUserRole({ priority: 'P4' })).toBe('P4');
    expect(describeUserRole({ roleTitle: 'Logistics' })).toBe('Logistics');
    expect(describeUserRole({})).toBe('');
  });

  it('formats working days in week order regardless of how they were stored', () => {
    expect(formatWeekDays([3, 1, 5])).toBe('Mon, Wed, Fri');
    expect(formatWeekDays([])).toBe('Not set');
    expect(formatWeekDays(undefined)).toBe('Not set');
  });

  it('covers every task bucket the My Tasks screen renders', () => {
    expect(BUCKET_META.map((meta) => meta.key)).toEqual([
      'overdue', 'due_soon', 'in_progress', 'waiting', 'completed',
    ]);
  });
});

describe('the Operations menu group', () => {
  const group = SIDEBAR_GROUPS.find((entry) => entry.label === 'Operations');

  it('exists so the new screens are reachable from the navbar', () => {
    expect(group).toBeTruthy();
  });

  it('lets every user reach their own operations view', () => {
    const mine = group.items.find((item) => item.path === ROUTES.OPERATIONS_MY);
    expect(mine?.roles).toEqual(['all']);
  });

  it('keeps configuration screens to Admin and Owner', () => {
    for (const path of [
      ROUTES.OPERATIONS_RESPONSIBILITIES,
      ROUTES.OPERATIONS_SETTINGS,
    ]) {
      const item = group.items.find((entry) => entry.path === path);
      expect(item, path).toBeTruthy();
      expect(item.roles).not.toContain('all');
    }
  });
});

import { describe, expect, it } from 'vitest';

import { SIDEBAR_GROUPS } from './sidebarMenu';
import { ROUTES } from './routes';

/**
 * Where a menu entry lives decides whether anyone ever finds it.
 *
 * The left sidebar is opt-in and off until an admin or the user turns it on
 * (`useSidebarVisibility`), so the top navbar is the only navigation always on
 * screen. Its dropdowns are not their own list — each one opens a named group
 * from `SIDEBAR_GROUPS`, mapped in `NAV_DROPDOWN_DEFS` in `TopNavbar.jsx`.
 *
 * That mapping is easy to miss when adding an item: a report filed under a
 * group whose label is "Attendance Report" appears under the **Attendance**
 * dropdown, which is where Business Reports first landed and why nobody could
 * find it. These tests pin the placement rather than the appearance.
 */

/** Kept in step with NAV_DROPDOWN_DEFS in Components/TopNavbar.jsx. */
const NAV_DROPDOWNS = {
  Attendance: ['Attendance Report'],
  Orders: ['Orders Reports'],
  Accounts: ['Accounts & UPI', 'Account Reports', 'Collection Reports'],
  Reports: ['Dashboard Reports'],
  WhatsApp: ['WhatsApp', 'Email'],
  Social: ['Social Media'],
  'Call Logs': ['Call Logs'],
  SOP: ['SOP'],
  Admin: ['Admin'],
};

const groupLabelled = (label) => SIDEBAR_GROUPS.find((group) => group.label === label);

/** Every item reachable from one top-navbar dropdown. */
const itemsUnder = (dropdown) =>
  NAV_DROPDOWNS[dropdown].flatMap((label) => groupLabelled(label)?.items ?? []);

describe('the top navbar dropdown map', () => {
  it('names groups that actually exist', () => {
    // A typo here silently empties a whole dropdown.
    const missing = Object.values(NAV_DROPDOWNS)
      .flat()
      .filter((label) => !groupLabelled(label));
    expect(missing).toEqual([]);
  });
});

describe('Business Reports', () => {
  it('sits under the Reports dropdown', () => {
    const paths = itemsUnder('Reports').map((item) => item.path);
    expect(paths).toContain(ROUTES.REPORTS_BUSINESS);
  });

  it('is not filed under Attendance', () => {
    // Where it was, and where nobody thought to look.
    const paths = itemsUnder('Attendance').map((item) => item.path);
    expect(paths).not.toContain(ROUTES.REPORTS_BUSINESS);
  });

  it('appears exactly once in the whole menu', () => {
    const hits = SIDEBAR_GROUPS.flatMap((group) => group.items).filter(
      (item) => item.path === ROUTES.REPORTS_BUSINESS
    );
    expect(hits).toHaveLength(1);
  });

  it('is restricted to Admin and Owner', () => {
    const [entry] = SIDEBAR_GROUPS.flatMap((group) => group.items).filter(
      (item) => item.path === ROUTES.REPORTS_BUSINESS
    );
    expect(entry.roles).toEqual(['Admin', 'Owner']);
    // 'all' here would put margins in front of every group in the business.
    expect(entry.roles).not.toContain('all');
  });
});

describe('every menu item', () => {
  it('is reachable from some dropdown', () => {
    // An item in a group no dropdown opens can only be reached by typing the
    // URL, which for a new feature means never.
    const reachable = new Set(Object.keys(NAV_DROPDOWNS).flatMap((d) => itemsUnder(d)));
    const orphans = SIDEBAR_GROUPS.filter(
      (group) => !Object.values(NAV_DROPDOWNS).flat().includes(group.label)
    ).map((group) => group.label);

    // 'Overview' is the Dashboard home link, surfaced separately by the navbar.
    expect(orphans).toEqual(['Overview']);
    expect(reachable.size).toBeGreaterThan(0);
  });

  it('has a path and a label', () => {
    for (const group of SIDEBAR_GROUPS) {
      for (const item of group.items) {
        expect(item.label, `${group.label} item`).toBeTruthy();
        expect(item.path, `${group.label} → ${item.label}`).toBeTruthy();
      }
    }
  });
});

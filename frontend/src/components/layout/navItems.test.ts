import { describe, expect, it } from 'vitest';

import { UserRole } from '@/client';

import { ADMIN_SECTION, MORE_ITEMS, NAV_ITEMS, NAV_SECTIONS, visibleNavItems, visibleNavSections } from './navItems';

describe('visibleNavItems', () => {
  it('keeps an item with no required role for every role, and for no user', () => {
    expect(visibleNavItems([NAV_ITEMS.dashboard], UserRole.USER)).toEqual([NAV_ITEMS.dashboard]);
    expect(visibleNavItems([NAV_ITEMS.dashboard], undefined)).toEqual([NAV_ITEMS.dashboard]);
  });

  it('shows an admin item to an admin only', () => {
    expect(visibleNavItems(MORE_ITEMS, UserRole.ADMIN)).toContain(NAV_ITEMS.sandbox);
    expect(visibleNavItems(MORE_ITEMS, UserRole.USER)).not.toContain(NAV_ITEMS.sandbox);
    expect(visibleNavItems(MORE_ITEMS, undefined)).not.toContain(NAV_ITEMS.sandbox);
  });
});

describe('visibleNavSections', () => {
  const sections = [...NAV_SECTIONS, ADMIN_SECTION];

  it('drops the Admin section for a user, so no empty heading shows', () => {
    const keys = visibleNavSections(sections, UserRole.USER).map(section => section.labelKey);

    expect(keys).not.toContain(ADMIN_SECTION.labelKey);
    expect(keys).toHaveLength(NAV_SECTIONS.length);
  });

  it('keeps the Admin section for an admin', () => {
    expect(visibleNavSections(sections, UserRole.ADMIN).map(section => section.labelKey)).toContain(
      ADMIN_SECTION.labelKey
    );
  });
});

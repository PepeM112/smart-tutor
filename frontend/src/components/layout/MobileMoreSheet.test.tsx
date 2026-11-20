// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MobileMoreSheet } from './MobileMoreSheet';

vi.mock('next/navigation', () => ({ usePathname: () => '/settings' }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('./useFavoriteNavItems', () => ({ useFavoriteNavItems: () => [] }));
vi.mock('@/features/auth/hooks/useLogout', () => ({ useLogout: () => vi.fn() }));

afterEach(cleanup);

describe('MobileMoreSheet', () => {
  it('lists Review and has neither Classrooms nor Profile & Settings', () => {
    render(<MobileMoreSheet open onOpenChange={vi.fn()} />);

    const hrefs = screen.getAllByRole('link').map(link => link.getAttribute('href'));
    expect(hrefs).toContain('/review');
    expect(hrefs).not.toContain('/classrooms');
    expect(hrefs).not.toContain('/settings');
  });

  it('keeps Log out in the account section', () => {
    render(<MobileMoreSheet open onOpenChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'auth.log_out' })).toBeTruthy();
  });
});

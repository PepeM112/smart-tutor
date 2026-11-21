// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type UserRead, UserRole } from '@/client';
import { useAuthStore } from '@/features/auth/store/authStore';

import { MobileMoreSheet } from './MobileMoreSheet';

vi.mock('next/navigation', () => ({ usePathname: () => '/settings' }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('./useFavoriteNavItems', () => ({ useFavoriteNavItems: () => [] }));
vi.mock('@/features/auth/hooks/useLogout', () => ({ useLogout: () => vi.fn() }));

afterEach(() => {
  cleanup();
  useAuthStore.setState({ user: null });
});

const hrefsFor = (role: UserRole): (string | null)[] => {
  useAuthStore.setState({ user: { id: 'u1', role, email: 'a@b.c', username: 'ana' } as UserRead });
  render(<MobileMoreSheet open onOpenChange={vi.fn()} />);
  return screen.getAllByRole('link').map(link => link.getAttribute('href'));
};

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

  it('lists Sandbox for an admin only', () => {
    expect(hrefsFor(UserRole.ADMIN)).toContain('/sandbox');
    cleanup();
    expect(hrefsFor(UserRole.USER)).not.toContain('/sandbox');
  });
});

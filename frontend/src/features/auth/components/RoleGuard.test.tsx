// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type UserRead, UserRole } from '@/client';

import { useAuthStore } from '../store/authStore';

import { RoleGuard } from './RoleGuard';

const replace = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const userWithRole = (role: UserRole): UserRead => ({ id: 'u1', role }) as UserRead;

const mount = (): void => {
  render(
    <RoleGuard requiredRole={UserRole.ADMIN}>
      <p>admin content</p>
    </RoleGuard>
  );
};

beforeEach(() => {
  useAuthStore.setState({ user: null });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('RoleGuard', () => {
  it('shows the children to a user with the role', () => {
    useAuthStore.setState({ user: userWithRole(UserRole.ADMIN) });
    mount();

    expect(screen.getByText('admin content')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('sends a user without the role to the dashboard and shows nothing', () => {
    useAuthStore.setState({ user: userWithRole(UserRole.USER) });
    mount();

    expect(screen.queryByText('admin content')).toBeNull();
    expect(replace).toHaveBeenCalledWith('/dashboard');
  });

  // On a reload the user is null until persist has loaded it. An admin must not be redirected in that gap.
  it('renders nothing and does not redirect before the store has loaded', () => {
    vi.spyOn(useAuthStore.persist, 'hasHydrated').mockReturnValue(false);
    mount();

    expect(screen.queryByText('admin content')).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it('shows the children for an admin once the store has loaded', () => {
    const hasHydrated = vi.spyOn(useAuthStore.persist, 'hasHydrated').mockReturnValue(false);
    mount();

    hasHydrated.mockReturnValue(true);
    act(() => {
      useAuthStore.setState({ user: userWithRole(UserRole.ADMIN) });
      void useAuthStore.persist.rehydrate();
    });

    expect(screen.getByText('admin content')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });
});

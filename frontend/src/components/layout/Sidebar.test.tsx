// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/features/auth/store/authStore';

import { Sidebar } from './Sidebar';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('./useFavoriteNavItems', () => ({ useFavoriteNavItems: () => [] }));
vi.mock('@/features/notifications/components/NotificationBell', () => ({ NotificationBell: () => null }));
vi.mock('@/features/auth/components/LogoutButton', () => ({ LogoutButton: () => null }));

afterEach(() => {
  cleanup();
  useAuthStore.setState({ user: null });
});

const toggle = (): void => {
  fireEvent.click(screen.getByRole('button', { name: /sidebar\.(collapse|expand)/ }));
};

describe('Sidebar', () => {
  it('keeps every label mounted when railed and hides it from assistive technology', () => {
    render(<Sidebar />);
    toggle();

    const label = screen.getByText('sidebar.profile_and_settings');
    expect(label.className).toContain('opacity-0');
    expect(label.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText('app.title').className).toContain('opacity-0');
    // The row keeps its name while the label is hidden.
    expect(screen.getByRole('link', { name: 'sidebar.profile_and_settings' })).toBeTruthy();
  });

  it('keeps section headings mounted at a fixed height, fading and hidden from assistive technology', () => {
    render(<Sidebar />);
    const heading = (): HTMLElement => screen.getByText('sidebar.learning');
    const sizeClasses = (): string[] =>
      heading()
        .className.split(' ')
        .filter(c => /^(h-|leading-|mb-)/.test(c));
    const expandedSize = sizeClasses();

    expect(expandedSize).toContain('h-5');
    expect(heading().className).toContain('opacity-100');
    toggle();

    expect(heading().className).toContain('opacity-0');
    expect(heading().getAttribute('aria-hidden')).toBe('true');
    expect(sizeClasses()).toEqual(expandedSize);
  });

  it('shows the labels again when expanded', () => {
    render(<Sidebar />);
    toggle();
    toggle();

    const label = screen.getByText('sidebar.profile_and_settings');
    expect(label.className).toContain('opacity-100');
    expect(label.getAttribute('aria-hidden')).toBeNull();
  });

  it('shows the user avatar in the Settings item, in the rail and expanded', () => {
    useAuthStore.setState({ user: { displayName: 'Ana', username: 'ana1' } as never });
    render(<Sidebar />);
    const settings = (): HTMLElement => screen.getByRole('link', { name: 'sidebar.profile_and_settings' });

    expect(settings().textContent).toContain('A');
    expect(settings().querySelector('svg')).toBeNull();
    toggle();
    expect(settings().textContent).toContain('A');
    expect(settings().querySelector('svg')).toBeNull();
  });
});

// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type UserRead } from '@/client';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useTheme } from '@/hooks/useTheme';

import { ThemeProvider } from './ThemeProvider';

const user = (theme: string): UserRead => ({ id: 'u1', username: 'jose', theme }) as UserRead;

function Probe() {
  const { theme } = useTheme();
  return <span data-testid="theme">{theme}</span>;
}

const shownTheme = (container: HTMLElement) => container.querySelector('[data-testid="theme"]')?.textContent;

beforeEach(() => {
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  useAuthStore.setState({ user: null });
});

afterEach(() => cleanup());

describe('ThemeProvider', () => {
  it('applies the theme of the user on login and when it changes', () => {
    const { container } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    act(() => {
      useAuthStore.setState({ user: user('dark') });
    });
    expect(shownTheme(container)).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');

    act(() => {
      useAuthStore.setState({ user: user('light') });
    });
    expect(shownTheme(container)).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('maps an old palette id saved on the user', () => {
    const { container } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    act(() => {
      useAuthStore.setState({ user: user('noir') });
    });
    expect(shownTheme(container)).toBe('dark');
  });
});

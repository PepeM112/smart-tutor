// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/features/auth/store/authStore';

import { UserAvatar } from './UserAvatar';

const setUser = (user: { displayName?: string | null; username: string }): void => {
  useAuthStore.setState({ user: user as never });
};

afterEach(() => {
  cleanup();
  useAuthStore.setState({ user: null });
});

describe('UserAvatar', () => {
  it('shows the first letter of the display name, in upper case', () => {
    setUser({ displayName: 'ana', username: 'zed' });
    const { container } = render(<UserAvatar />);

    expect(container.textContent).toBe('A');
  });

  it('falls back to the username without a display name', () => {
    setUser({ displayName: null, username: 'zed' });
    const { container } = render(<UserAvatar />);

    expect(container.textContent).toBe('Z');
  });

  it('is hidden from assistive technology and takes a class override', () => {
    setUser({ username: 'zed' });
    const { container } = render(<UserAvatar className="size-5" />);
    const avatar = container.firstElementChild;

    expect(avatar?.getAttribute('aria-hidden')).toBe('true');
    expect(avatar?.className).toContain('size-5');
    expect(avatar?.className).not.toContain('size-7');
  });
});

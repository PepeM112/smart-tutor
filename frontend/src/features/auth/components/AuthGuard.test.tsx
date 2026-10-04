// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { sdk } from '@/lib/apiClient';

import { AuthGuard } from './AuthGuard';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/lib/apiClient', () => ({ sdk: { usersMe: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function mount() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthGuard>
        <p>page content</p>
      </AuthGuard>
    </QueryClientProvider>
  );
}

describe('AuthGuard', () => {
  // Regression: the guard returned null while `/me` loaded, so the page was blank.
  it('shows a loading status, not a blank screen, while /me loads', () => {
    vi.mocked(sdk.usersMe).mockReturnValue(new Promise(() => undefined) as never);
    mount();

    expect(screen.getByRole('status', { name: 'common.loading' })).toBeTruthy();
    expect(screen.queryByText('page content')).toBeNull();
  });

  it('shows the children when /me succeeds', async () => {
    vi.mocked(sdk.usersMe).mockResolvedValue({ data: { id: 'u1' } } as never);
    mount();

    expect(await screen.findByText('page content')).toBeTruthy();
  });
});

// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { sdk } from '@/lib/apiClient';

import { LogoutButton } from './LogoutButton';

const push = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/lib/apiClient', () => ({ sdk: { usersLogout: vi.fn() } }));
// The dialog itself is not under test: a plain button runs `onConfirm`.
vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: ({ onConfirm }: { onConfirm: () => void }) => <button onClick={onConfirm}>confirm logout</button>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('LogoutButton', () => {
  it('clears the query cache before it leaves, also when the logout call fails', async () => {
    vi.mocked(sdk.usersLogout).mockRejectedValue(new Error('offline'));
    const queryClient = new QueryClient();
    queryClient.setQueryData(['feed', 'posts', 'c1'], { pages: [], pageParams: [] });
    render(
      <QueryClientProvider client={queryClient}>
        <LogoutButton />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByText('confirm logout'));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/login'));
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});

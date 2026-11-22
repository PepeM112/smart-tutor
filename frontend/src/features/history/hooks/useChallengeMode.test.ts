// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { sdk } from '@/lib/apiClient';

import { useChallengeMode } from './useChallengeMode';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { error?: string }) => (values?.error ? `${key}:${values.error}` : key),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/apiClient', () => ({ sdk: { answersChallenge: vi.fn() } }));

const challenge = vi.mocked(sdk.answersChallenge);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderChallengeHook() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return renderHook(() => useChallengeMode([], 'a1'), { wrapper });
}

describe('useChallengeMode', () => {
  it('shows the detail of a flat SDK error in the failure toast', async () => {
    challenge.mockRejectedValue({ detail: 'Challenge window is closed' });
    const { result } = renderChallengeHook();

    act(() => result.current.submitChallenge());

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('challenge.challenge_failed:Challenge window is closed')
    );
  });

  it('falls back to the message of an Error without detail', async () => {
    challenge.mockRejectedValue(new Error('Network down'));
    const { result } = renderChallengeHook();

    act(() => result.current.submitChallenge());

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('challenge.challenge_failed:Network down'));
  });
});

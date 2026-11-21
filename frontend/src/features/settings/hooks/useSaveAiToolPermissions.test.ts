// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type AiToolPermissionRead } from '@/client';
import { AI_PERMISSIONS_QUERY_KEY } from '@/features/assist/hooks/useAiToolPermissions';
import { sdk } from '@/lib/apiClient';

import { useSaveAiToolPermissions } from './useSaveAiToolPermissions';

import type { ReactNode } from 'react';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/apiClient', () => ({ sdk: { usersUpdateAiToolPermissions: vi.fn() } }));
vi.mock('@/features/assist/hooks/useAiToolPermissions', () => ({
  AI_PERMISSIONS_QUERY_KEY: ['ai-tool-permissions'],
}));

const save = vi.mocked(sdk.usersUpdateAiToolPermissions);

const permission = (name: string): AiToolPermissionRead => ({
  name,
  kind: 'read',
  defaultAutoApprove: false,
  autoApprove: false,
});

type Deferred = { resolve: () => void; reject: () => void };

/** Each call to the SDK waits until the test settles it, so the test controls the order. */
function queueDeferredSaves(): Deferred[] {
  const deferred: Deferred[] = [];
  save.mockImplementation(
    () =>
      new Promise((resolve, reject) => {
        deferred.push({ resolve: () => resolve({ data: [] }), reject: () => reject(new Error('boom')) });
      }) as never
  );
  return deferred;
}

const autoApproveOf = (client: QueryClient, name: string): boolean | undefined =>
  client.getQueryData<AiToolPermissionRead[]>(AI_PERMISSIONS_QUERY_KEY)?.find(tool => tool.name === name)?.autoApprove;

function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  client.setQueryData(AI_PERMISSIONS_QUERY_KEY, [permission('a'), permission('b')]);
  const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue();
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  const { result } = renderHook(() => useSaveAiToolPermissions(), { wrapper });
  return { client, invalidate, result };
}

beforeEach(() => vi.clearAllMocks());

describe('useSaveAiToolPermissions with two overlapping toggles', () => {
  it('keeps the second change and refetches once when the first save fails', async () => {
    const deferred = queueDeferredSaves();
    const { client, invalidate, result } = setup();

    act(() => {
      result.current.mutate({ a: true });
      result.current.mutate({ b: true });
    });
    await waitFor(() => expect(deferred).toHaveLength(1));

    await act(() => Promise.resolve(deferred[0].reject()));

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(autoApproveOf(client, 'b')).toBe(true);
    expect(invalidate).not.toHaveBeenCalled();

    await waitFor(() => expect(deferred).toHaveLength(2));
    await act(() => Promise.resolve(deferred[1].resolve()));

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: AI_PERMISSIONS_QUERY_KEY });
  });

  it('does not refetch when the first save succeeds while the second is pending', async () => {
    const deferred = queueDeferredSaves();
    const { client, invalidate, result } = setup();

    act(() => {
      result.current.mutate({ a: true });
      result.current.mutate({ b: true });
    });
    await waitFor(() => expect(deferred).toHaveLength(1));

    await act(() => Promise.resolve(deferred[0].resolve()));

    await waitFor(() => expect(deferred).toHaveLength(2));
    expect(invalidate).not.toHaveBeenCalled();
    expect(autoApproveOf(client, 'b')).toBe(true);
  });

  it('shows no success toast, only an error toast on failure', async () => {
    const deferred = queueDeferredSaves();
    const { invalidate, result } = setup();

    act(() => result.current.mutate({ a: true }));
    await waitFor(() => expect(deferred).toHaveLength(1));
    await act(() => Promise.resolve(deferred[0].resolve()));

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    expect(toast.success).not.toHaveBeenCalled();
  });
});

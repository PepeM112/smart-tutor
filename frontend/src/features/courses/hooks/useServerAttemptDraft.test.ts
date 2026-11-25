// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sdk } from '@/lib/apiClient';

import { useServerAttemptDraft } from './useServerAttemptDraft';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/apiClient', () => ({ sdk: { spacesSaveAttemptDraft: vi.fn() } }));

const SAVE_DELAY_MS = 1500;
const saveDraft = vi.mocked(sdk.spacesSaveAttemptDraft);

// Only the fields the hook reads: the SDK error carries the HTTP status and the API `code`.
const refusal = { status: 409, code: 'attempt_time_over' };

function setup() {
  const onRefused = vi.fn();
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  const view = renderHook(() => useServerAttemptDraft('c1', 'a1', onRefused), { wrapper });
  return { ...view, onRefused };
}

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const savedAnswers = (call: number) => saveDraft.mock.calls[call]?.[0]?.body?.answers;

beforeEach(() => {
  vi.useFakeTimers();
  saveDraft.mockResolvedValue({} as never);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useServerAttemptDraft', () => {
  it('sends one save with the last answers after several changes', async () => {
    const { result } = setup();

    act(() => result.current.save({ q1: 'a' }));
    await advance(SAVE_DELAY_MS - 100);
    act(() => result.current.save({ q1: 'ab' }));
    await advance(SAVE_DELAY_MS - 100);
    expect(saveDraft).not.toHaveBeenCalled();
    await advance(100);

    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(savedAnswers(0)).toEqual([{ questionId: 'q1', userAnswer: 'ab' }]);
  });

  it('cancels the pending save on stop', async () => {
    const { result, unmount } = setup();

    act(() => result.current.save({ q1: 'a' }));
    act(() => result.current.stop());
    await advance(SAVE_DELAY_MS);
    unmount();

    expect(saveDraft).not.toHaveBeenCalled();
  });

  it('sends the pending answers on unmount', async () => {
    const { result, unmount } = setup();

    act(() => result.current.save({ q1: 'a' }));
    unmount();
    await advance(0);

    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(savedAnswers(0)).toEqual([{ questionId: 'q1', userAnswer: 'a' }]);
  });

  it('shows no toast and calls onRefused on a known 409 code', async () => {
    saveDraft.mockRejectedValue(refusal);
    const { result, onRefused } = setup();

    act(() => result.current.save({ q1: 'a' }));
    await advance(SAVE_DELAY_MS);

    expect(toast.error).not.toHaveBeenCalled();
    expect(onRefused).toHaveBeenCalledTimes(1);
    expect(onRefused).toHaveBeenCalledWith(refusal);
  });

  it('stops saving after a known 409 code', async () => {
    saveDraft.mockRejectedValue(refusal);
    const { result } = setup();

    act(() => result.current.save({ q1: 'a' }));
    await advance(SAVE_DELAY_MS);
    act(() => result.current.save({ q1: 'ab' }));
    await advance(SAVE_DELAY_MS);

    expect(saveDraft).toHaveBeenCalledTimes(1);
  });

  it('shows one toast with a fixed id on another error', async () => {
    saveDraft.mockRejectedValue({ status: 500 });
    const { result, onRefused } = setup();

    act(() => result.current.save({ q1: 'a' }));
    await advance(SAVE_DELAY_MS);

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('courses.attempt_draft_save_failed', { id: 'attempt-draft-save-failed' });
    expect(onRefused).not.toHaveBeenCalled();
  });

  it('treats a 409 with an unknown code as a failed call', async () => {
    saveDraft.mockRejectedValue({ status: 409, code: 'something_new' });
    const { result, onRefused } = setup();

    act(() => result.current.save({ q1: 'a' }));
    await advance(SAVE_DELAY_MS);

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(onRefused).not.toHaveBeenCalled();
  });

  it('saves the next change after a failed submit calls resume', async () => {
    const { result } = setup();

    act(() => result.current.stop());
    act(() => result.current.save({ q1: 'lost' }));
    await advance(SAVE_DELAY_MS);
    expect(saveDraft).not.toHaveBeenCalled();

    act(() => result.current.resume());
    act(() => result.current.save({ q1: 'kept' }));
    await advance(SAVE_DELAY_MS);

    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(savedAnswers(0)).toEqual([{ questionId: 'q1', userAnswer: 'kept' }]);
  });
});

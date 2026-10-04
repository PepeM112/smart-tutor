// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAssist } from './useAssist';

import type { PageContext } from '../types';
import type { ReactNode } from 'react';

// jsdom does not implement requestAnimationFrame/cancelAnimationFrame. The
// queue's render loop (useStreamQueue.ts) relies on rAF for pacing, so we
// polyfill it with setTimeout the same way useStreamQueue.test.ts does.
beforeEach(() => {
  vi.stubGlobal(
    'requestAnimationFrame',
    (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0) as unknown as number
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const updatePermissions = vi.hoisted(() => vi.fn());
vi.mock('@/lib/apiClient', () => ({
  sdk: { usersUpdateAiToolPermissions: updatePermissions, questionsBulkRestore: vi.fn() },
}));

const PAGE_CONTEXT: PageContext = {
  route: '/tests',
  resourceType: null,
  resourceId: null,
  contextData: null,
};

type MockSSEEvent = { event: string; data: unknown };

/** Builds a mock SSE `ReadableStreamDefaultReader` that hands out one encoded event per `read()` call. */
function makeSSEReader(events: MockSSEEvent[]): { read: () => Promise<{ done: boolean; value?: Uint8Array }> } {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    read: () => {
      if (index >= events.length) {
        return Promise.resolve({ done: true, value: undefined });
      }
      const { event, data } = events[index];
      index += 1;
      const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      return Promise.resolve({ done: false, value: encoder.encode(chunk) });
    },
  };
}

function mockFetchWithSSE(events: MockSSEEvent[]): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      body: { getReader: () => makeSSEReader(events) },
      json: () => Promise.resolve({}),
    })
  );
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useAssist — SSE integration seam (P0-1/P0-2 regression)', () => {
  it('never splits a text segment across a tool round-trip mid-reveal', async () => {
    mockFetchWithSSE([
      { event: 'text_delta', data: { content: 'Hello ' } },
      { event: 'tool_call', data: { id: 'call-1', name: 'search', arguments: {} } },
      { event: 'tool_executing', data: { id: 'call-1', name: 'search' } },
      { event: 'tool_result', data: { id: 'call-1', name: 'search', output: 'ok' } },
      { event: 'text_delta', data: { content: 'World' } },
      { event: 'done', data: { usage: { inputTokens: 1, outputTokens: 1 } } },
    ]);

    const { result } = renderHook(() => useAssist(PAGE_CONTEXT), { wrapper });

    act(() => {
      result.current.send('hi');
    });

    // Everything up to (and including) the `await fetch(...)` inside
    // streamResponse runs synchronously on send() — nothing async has had a
    // chance to run yet, so the assistant turn placeholder must still be
    // empty here. This is the exact checkpoint where P0-2's "don't eagerly
    // write ahead of queue order" guard lives.
    const assistantTurnEarly = result.current.turns.find(t => t.role === 'assistant');
    expect(assistantTurnEarly?.segments ?? []).toHaveLength(0);

    await waitFor(() => expect(result.current.isStreaming).toBe(false), { timeout: 3000 });

    const assistantTurn = result.current.turns.find(t => t.role === 'assistant');
    expect(assistantTurn).toBeDefined();
    expect(assistantTurn?.segments.map(s => s.type)).toEqual(['text', 'tool_indicator', 'tool_result', 'text']);

    const textSegments = assistantTurn?.segments.filter(s => s.type === 'text') ?? [];
    expect(textSegments).toHaveLength(2);
    expect(textSegments.every(s => s.type === 'text' && !s.streaming)).toBe(true);
    expect(textSegments.map(s => (s.type === 'text' ? s.content : ''))).toEqual(['Hello ', 'World']);

    // `tool_executing` must not append a second indicator for the same call.
    const indicatorSegments =
      assistantTurn?.segments.filter(s => s.type === 'tool_indicator' && s.id === 'call-1') ?? [];
    expect(indicatorSegments).toHaveLength(1);
  });

  it('applies tool_executing through the queue gate without dropping the indicator', async () => {
    mockFetchWithSSE([
      { event: 'text_delta', data: { content: 'Hello ' } },
      { event: 'tool_call', data: { id: 'call-1', name: 'search', arguments: {} } },
      { event: 'tool_executing', data: { id: 'call-1', name: 'search' } },
      { event: 'done', data: { usage: { inputTokens: 1, outputTokens: 1 } } },
    ]);

    const { result } = renderHook(() => useAssist(PAGE_CONTEXT), { wrapper });

    act(() => {
      result.current.send('hi');
    });

    await waitFor(() => expect(result.current.isStreaming).toBe(false), { timeout: 3000 });

    const assistantTurn = result.current.turns.find(t => t.role === 'assistant');
    const indicatorSegments =
      assistantTurn?.segments.filter(s => s.type === 'tool_indicator' && s.id === 'call-1') ?? [];

    // End-state only; the ordering guarantee is covered in useStreamQueue.test.ts.
    expect(indicatorSegments).toHaveLength(1);
    expect(indicatorSegments[0]?.type === 'tool_indicator' && indicatorSegments[0].status).toBe('running');
  });
});

describe('useAssist — tool history after an approval (tool_use without tool_result regression)', () => {
  const usage = { usage: { inputTokens: 1, outputTokens: 1 } };
  const streamOf = (events: MockSSEEvent[]) => ({
    ok: true,
    body: { getReader: () => makeSSEReader(events) },
    json: () => Promise.resolve({}),
  });

  it('sends the result of the approved tool right after its own tool call', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        streamOf([
          { event: 'tool_call', data: { id: 'cf', name: 'create_folder', arguments: { name: 'X' } } },
          { event: 'confirm_required', data: { id: 'cf', name: 'create_folder', arguments: { name: 'X' } } },
          { event: 'done', data: { ...usage, pendingConfirmations: ['cf'] } },
        ])
      )
      .mockResolvedValueOnce(
        streamOf([
          { event: 'tool_executing', data: { id: 'cf', name: 'create_folder' } },
          { event: 'tool_result', data: { id: 'cf', name: 'create_folder', output: 'Created X' } },
          { event: 'text_delta', data: { content: 'Moving.' } },
          { event: 'tool_call', data: { id: 'mv', name: 'move_items', arguments: {} } },
          { event: 'confirm_required', data: { id: 'mv', name: 'move_items', arguments: {} } },
          { event: 'done', data: { ...usage, pendingConfirmations: ['mv'] } },
        ])
      )
      .mockResolvedValueOnce(streamOf([{ event: 'done', data: usage }]));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAssist(PAGE_CONTEXT), { wrapper });

    act(() => result.current.send('move my notes'));
    await waitFor(() => expect(result.current.isStreaming).toBe(false), { timeout: 3000 });
    act(() => result.current.confirm('cf', true));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.isStreaming).toBe(false), { timeout: 3000 });
    act(() => result.current.confirm('mv', true));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    const thirdBody = JSON.parse((fetchMock.mock.calls[2][1] as { body: string }).body) as {
      messages: { role: string; toolCalls?: { id: string }[]; toolResults?: { toolCallId: string }[] }[];
    };
    expect(thirdBody.messages.map(m => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
    expect(thirdBody.messages[1].toolCalls?.map(tc => tc.id)).toEqual(['cf']);
    expect(thirdBody.messages[2].toolResults?.map(r => r.toolCallId)).toEqual(['cf']);
    expect(thirdBody.messages[3].toolCalls?.map(tc => tc.id)).toEqual(['mv']);
  });
});

describe('useAssist — always allow', () => {
  const usage = { usage: { inputTokens: 1, outputTokens: 1 } };

  it('saves the permission, then approves every pending card of the same tool and rejects the others', async () => {
    updatePermissions.mockResolvedValue({ data: [] });
    const call = (id: string, name: string) => [
      { event: 'tool_call', data: { id, name, arguments: {} } },
      { event: 'confirm_required', data: { id, name, arguments: {} } },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () =>
            makeSSEReader([
              ...call('f1', 'create_folder'),
              ...call('f2', 'create_folder'),
              ...call('m1', 'move_items'),
              { event: 'done', data: { ...usage, pendingConfirmations: ['f1', 'f2', 'm1'] } },
            ]),
        },
        json: () => Promise.resolve({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => makeSSEReader([{ event: 'done', data: usage }]) },
        json: () => Promise.resolve({}),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAssist(PAGE_CONTEXT), { wrapper });

    act(() => result.current.send('organise'));
    await waitFor(() => expect(result.current.isStreaming).toBe(false), { timeout: 3000 });
    act(() => result.current.confirm('f1', true, { alwaysAllow: true }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(updatePermissions).toHaveBeenCalledWith({ body: { permissions: { create_folder: true } } });

    const body = JSON.parse((fetchMock.mock.calls[1][1] as { body: string }).body) as {
      toolConfirmations: { toolCallId: string; approved: boolean }[];
    };
    expect(body.toolConfirmations).toEqual([
      { toolCallId: 'f1', approved: true },
      { toolCallId: 'f2', approved: true },
      { toolCallId: 'm1', approved: false },
    ]);
  });
});

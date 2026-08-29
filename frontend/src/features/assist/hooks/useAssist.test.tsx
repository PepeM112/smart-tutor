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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
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
  });
});

// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AssistChatBody } from '../components/AssistChatBody';

import { AssistProvider, useAssistActions, useAssistState } from './AssistContext';

import type { ReactNode } from 'react';

beforeEach(() => {
  vi.stubGlobal(
    'requestAnimationFrame',
    (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0) as unknown as number
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Like the real libraries, the translator and the router keep one identity between renders.
const stable = vi.hoisted(() => ({
  t: Object.assign((key: string) => key, { has: () => false }),
  router: { push: () => undefined },
}));
vi.mock('next-intl', () => ({ useTranslations: () => stable.t }));
vi.mock('next/navigation', () => ({ useRouter: () => stable.router, usePathname: () => '/tests' }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock('@/lib/apiClient', () => ({ sdk: {} }));
vi.mock('./PageDataContext', () => ({ usePageData: () => ({ contextData: null }) }));

// A markdown render stands for one assistant bubble render: the real component is costly, and a finished
// turn must not pay for it again while another turn streams.
const markdownRenders = vi.hoisted(() => vi.fn<(content: string) => void>());
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => {
    markdownRenders(children);
    return <p>{children}</p>;
  },
}));
vi.mock('remark-gfm', () => ({ default: () => undefined }));

const pageRenders = vi.hoisted(() => vi.fn<() => void>());

/** Stands for a page component (a form, the header toggle) that only needs the actions. */
function PageConsumer() {
  useAssistActions();
  pageRenders();
  return null;
}

type Send = (text: string) => void;
const sendRef: { current: Send | null } = { current: null };

function Chat() {
  const { turns, isStreaming } = useAssistState();
  const { confirm, send } = useAssistActions();
  useEffect(() => {
    sendRef.current = send;
  }, [send]);
  return <AssistChatBody turns={turns} onConfirm={confirm} isStreaming={isStreaming} footer={null} />;
}

const TOKEN_DELAY_MS = 8;

function stubStream(text: string, chunks: number): void {
  const encoder = new TextEncoder();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => {
      const events = [
        ...Array.from({ length: chunks }, () => ({ event: 'text_delta', data: { content: text } })),
        { event: 'done', data: {} },
      ];
      let index = 0;
      return Promise.resolve({
        ok: true,
        body: {
          getReader: () => ({
            // A small delay per event, like a network: tokens reach the hook one by one.
            read: async () => {
              await new Promise(resolve => setTimeout(resolve, TOKEN_DELAY_MS));
              if (index >= events.length) return { done: true, value: undefined };
              const { event, data } = events[index++];
              return { done: false, value: encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) };
            },
          }),
        },
      });
    })
  );
}

async function sendAndWait(text: string, chunks: number, chunkText: string): Promise<void> {
  stubStream(chunkText, chunks);
  act(() => sendRef.current?.(text));
  // The pacing loop fills the bubble; wait for the last turn to hold its full text.
  await waitFor(() => expect(document.body.textContent).toContain(chunkText.repeat(chunks).trim()), { timeout: 5000 });
  await act(() => new Promise(resolve => setTimeout(resolve, 50)));
}

describe('Ask AI streaming renders', () => {
  it('re-renders only the streaming turn while tokens arrive', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AssistProvider>
          <PageConsumer />
          <Chat />
        </AssistProvider>
      </QueryClientProvider>
    );

    // Two finished exchanges first, so there is history to protect.
    await sendAndWait('first question', 1, 'finished-answer-one ');
    await sendAndWait('second question', 1, 'finished-answer-two ');

    markdownRenders.mockClear();
    pageRenders.mockClear();

    await sendAndWait('third question', 40, 'tok ');

    const rendersOf = (content: string): number =>
      markdownRenders.mock.calls.filter(([c]) => c.startsWith(content)).length;
    const streamingRenders = markdownRenders.mock.calls.filter(([c]) => c.startsWith('tok')).length;

    expect(streamingRenders).toBeGreaterThan(0);
    expect(pageRenders).not.toHaveBeenCalled();
    expect(rendersOf('finished-answer-one')).toBe(0);
    expect(rendersOf('finished-answer-two')).toBe(0);
  });
});

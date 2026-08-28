import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { createStreamQueue, type StreamQueueHandle } from './use-stream-queue';

// jsdom-less unit test: requestAnimationFrame isn't a Node global. Route it
// through setTimeout so vi.useFakeTimers() drives it deterministically.
globalThis.requestAnimationFrame = ((cb: FrameRequestCallback): number =>
  setTimeout(() => cb(performance.now()), 16) as unknown as number) as typeof requestAnimationFrame;
globalThis.cancelAnimationFrame = ((id: number): void => clearTimeout(id)) as typeof cancelAnimationFrame;

type Event =
  | { type: 'update'; id: string; content: string; streaming: boolean; at: number }
  | { type: 'run'; kind: string; at: number };

function setup(): { queue: StreamQueueHandle; events: Event[] } {
  const events: Event[] = [];
  const queue = createStreamQueue({
    updateTextSegment: (id, content, streaming) => {
      events.push({ type: 'update', id, content, streaming, at: performance.now() });
    },
  });
  return { queue, events };
}

function runToCompletion(ms = 20_000): void {
  vi.advanceTimersByTime(ms);
}

describe('use-stream-queue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('gates a single boundary event behind its preceding text segment', () => {
    const { queue, events } = setup();

    queue.extendTarget('seg-1', 'Hello');
    queue.enqueue('tool_call', () => events.push({ type: 'run', kind: 'tool_call', at: performance.now() }));

    runToCompletion();

    const lastSeg1Update = [...events].reverse().find(e => e.type === 'update' && e.id === 'seg-1');
    expect(lastSeg1Update).toMatchObject({ content: 'Hello', streaming: false });

    const seg1DoneIndex = events.findIndex(
      e => e.type === 'update' && e.id === 'seg-1' && e.content === 'Hello' && e.streaming === false
    );
    const toolCallIndex = events.findIndex(e => e.type === 'run' && e.kind === 'tool_call');
    expect(seg1DoneIndex).toBeGreaterThanOrEqual(0);
    expect(toolCallIndex).toBeGreaterThan(seg1DoneIndex);
  });

  it('does not merge or reorder text when a second round starts before the first round is dequeued', () => {
    const { queue, events } = setup();

    // Wire order: text-1, tool_call, tool_result, text-2, done.
    queue.extendTarget('seg-1', 'Hello');
    queue.enqueue('tool_call', () => events.push({ type: 'run', kind: 'tool_call', at: performance.now() }));
    queue.enqueue('tool_result', () => events.push({ type: 'run', kind: 'tool_result', at: performance.now() }));
    // Round 2 text arrives immediately — before round 1's text has revealed or
    // its boundary events have been dequeued. This is exactly the race that
    // used to clobber the single `openSegment` slot.
    queue.extendTarget('seg-2', 'World');
    queue.enqueue('done', () => events.push({ type: 'run', kind: 'done', at: performance.now() }));

    runToCompletion();

    // seg-1 must still reach full content — it must never get silently dropped.
    const seg1Complete = events.find(
      e => e.type === 'update' && e.id === 'seg-1' && e.content === 'Hello' && e.streaming === false
    );
    expect(seg1Complete).toBeDefined();

    // seg-2 must also reach full content — it must never get silently dropped.
    const seg2Complete = events.find(
      e => e.type === 'update' && e.id === 'seg-2' && e.content === 'World' && e.streaming === false
    );
    expect(seg2Complete).toBeDefined();

    // Strict wire order preserved: seg-1 done -> tool_call -> tool_result -> seg-2 done -> done.
    const indexOf = (pred: (e: Event) => boolean) => events.findIndex(pred);
    const seg1DoneIdx = indexOf(e => e === seg1Complete);
    const toolCallIdx = indexOf(e => e.type === 'run' && e.kind === 'tool_call');
    const toolResultIdx = indexOf(e => e.type === 'run' && e.kind === 'tool_result');
    const seg2DoneIdx = indexOf(e => e === seg2Complete);
    const doneIdx = indexOf(e => e.type === 'run' && e.kind === 'done');

    expect(seg1DoneIdx).toBeLessThan(toolCallIdx);
    expect(toolCallIdx).toBeLessThan(toolResultIdx);
    expect(toolResultIdx).toBeLessThan(seg2DoneIdx);
    expect(seg2DoneIdx).toBeLessThan(doneIdx);

    // seg-2 must never have been merged into seg-1's content.
    const seg1Updates = events.filter(e => e.type === 'update' && e.id === 'seg-1');
    expect(seg1Updates.every(e => e.type === 'update' && !e.content.includes('World'))).toBe(true);
  });

  it('holds the tool indicator for at least the minimum visible duration', () => {
    const { queue, events } = setup();

    queue.enqueue('tool_call', () => events.push({ type: 'run', kind: 'tool_call', at: performance.now() }));
    queue.enqueue('tool_result', () => events.push({ type: 'run', kind: 'tool_result', at: performance.now() }));

    runToCompletion();

    const toolCall = events.find(
      (e): e is Extract<Event, { type: 'run' }> => e.type === 'run' && e.kind === 'tool_call'
    );
    const toolResult = events.find(
      (e): e is Extract<Event, { type: 'run' }> => e.type === 'run' && e.kind === 'tool_result'
    );
    expect(toolCall).toBeDefined();
    expect(toolResult).toBeDefined();
    expect(toolResult!.at - toolCall!.at).toBeGreaterThanOrEqual(500);
  });

  it('flush() resolves every queued item in order without waiting for reveal or the min-hold', () => {
    const { queue, events } = setup();

    queue.extendTarget('seg-1', 'Hello world, this is a long line of unrevealed text');
    queue.enqueue('tool_call', () => events.push({ type: 'run', kind: 'tool_call', at: performance.now() }));
    queue.enqueue('tool_result', () => events.push({ type: 'run', kind: 'tool_result', at: performance.now() }));
    queue.extendTarget('seg-2', 'Second round text');
    queue.enqueue('done', () => events.push({ type: 'run', kind: 'done', at: performance.now() }));

    queue.flush();

    const seg1Final = events.find(e => e.type === 'update' && e.id === 'seg-1');
    const seg2Final = events.find(e => e.type === 'update' && e.id === 'seg-2');
    expect(seg1Final).toMatchObject({
      content: 'Hello world, this is a long line of unrevealed text',
      streaming: false,
    });
    expect(seg2Final).toMatchObject({ content: 'Second round text', streaming: false });

    const kinds = events.map(e => (e.type === 'run' ? e.kind : e.type === 'update' ? `update:${e.id}` : ''));
    expect(kinds).toEqual(['update:seg-1', 'tool_call', 'tool_result', 'update:seg-2', 'done']);
  });
});

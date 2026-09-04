import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { createStreamQueue, type StreamQueueHandle } from './useStreamQueue';

// jsdom-less unit test: requestAnimationFrame isn't a Node global. Route it
// through setTimeout so vi.useFakeTimers() drives it deterministically.
globalThis.requestAnimationFrame = ((cb: FrameRequestCallback): number =>
  setTimeout(() => cb(performance.now()), 16) as unknown as number);
globalThis.cancelAnimationFrame = ((id: number): void => clearTimeout(id));

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

  // These tests drive the queue through the exact call pattern useAssist.ts's
  // streamResponse now uses: a synchronous "is a segment open" flag decides
  // continuation (never `turns` state), and `updateTextSegment` upserts
  // (create-or-update) instead of the caller creating the segment eagerly.
  // Regression coverage for P0-1 (segment identity reuse on a fast tool
  // round-trip) and P0-2 (text landing in `turns` ahead of the tool_result
  // that should gate it).
  describe('caller pattern: sync flag + upserting updateTextSegment', () => {
    type TextSeg = { type: 'text'; id: string; content: string; streaming: boolean };
    type MarkerSeg = { type: 'tool_indicator' | 'tool_result'; id: string };
    type Seg = TextSeg | MarkerSeg;

    function simulateAssistStream(): {
      queue: StreamQueueHandle;
      segments: Seg[];
      textDelta: (content: string) => void;
      toolCall: (id: string) => void;
      toolResult: (id: string) => void;
    } {
      const segments: Seg[] = [];

      const queue = createStreamQueue({
        updateTextSegment: (segmentId, content, streaming) => {
          const existing = segments.find(s => s.id === segmentId);
          if (existing && existing.type === 'text') {
            existing.content = content;
            existing.streaming = streaming;
          } else {
            segments.push({ type: 'text', id: segmentId, content, streaming });
          }
        },
      });

      let textSegmentOpen = false;
      let activeTextSegmentId = '';
      let accumulatedText = '';
      let textSegmentOffset = 0;
      let idCounter = 0;
      const nextId = () => `seg-${++idCounter}`;

      function textDelta(content: string): void {
        accumulatedText += content;
        if (!textSegmentOpen) {
          activeTextSegmentId = nextId();
          textSegmentOffset = accumulatedText.length - content.length;
          textSegmentOpen = true;
        }
        queue.extendTarget(activeTextSegmentId, accumulatedText.slice(textSegmentOffset));
      }

      function toolCall(id: string): void {
        textSegmentOpen = false;
        queue.enqueue('tool_call', () => segments.push({ type: 'tool_indicator', id }));
      }

      function toolResult(id: string): void {
        textSegmentOpen = false;
        queue.enqueue('tool_result', () => segments.push({ type: 'tool_result', id: `${id}-result` }));
      }

      return { queue, segments, textDelta, toolCall, toolResult };
    }

    it('P0-1: a fast tool round-trip never merges into or clobbers the next text round', () => {
      const { queue, segments, textDelta, toolCall, toolResult } = simulateAssistStream();

      textDelta('Round one. ');
      // Tool call+result both arrive (and get enqueued) before round one's
      // text has revealed a single character — the old code decided
      // continuation from `turns` state, which hadn't caught up yet, and
      // would have reused round one's segment id here.
      toolCall('t1');
      toolResult('t1');
      textDelta('Round two.');

      runToCompletion();
      queue.flush();

      const textSegs = segments.filter((s): s is TextSeg => s.type === 'text');
      expect(textSegs).toHaveLength(2);
      expect(textSegs[0]).toMatchObject({ content: 'Round one. ', streaming: false });
      expect(textSegs[1]).toMatchObject({ content: 'Round two.', streaming: false });
    });

    it('P0-2: a new text round is never written to `turns` ahead of the tool_result gating it', () => {
      const { queue, segments, textDelta, toolCall, toolResult } = simulateAssistStream();

      textDelta('Before. ');
      toolCall('t1');
      toolResult('t1');
      textDelta('After.');

      runToCompletion();
      queue.flush();

      const toolResultIdx = segments.findIndex(s => s.type === 'tool_result' && s.id === 't1-result');
      const afterSegIdx = segments.findIndex(s => s.type === 'text' && s.content === 'After.');
      expect(toolResultIdx).toBeGreaterThanOrEqual(0);
      expect(afterSegIdx).toBeGreaterThan(toolResultIdx);
    });
  });
});

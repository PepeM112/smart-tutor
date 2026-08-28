// ---------------------------------------------------------------------------
// Stream queue — the reveal/pacing engine for one AI Assistant SSE stream.
//
// Pure, DOM-free module (timers + state transitions only, no React, no fetch).
// Owns two responsibilities that used to live in separate, racing places:
//
//   1. Character-by-character reveal of the open text segment(s), at a pace
//      that speeds up as unrevealed backlog grows (see `computePace`).
//   2. A strict FIFO gate for "boundary" SSE events (tool_call, tool_result,
//      confirm_required, done) — a boundary event is not applied to `turns`
//      state until the text segment that preceded it (in wire order) has
//      fully caught up its reveal. This is what stops the old bug where a
//      tool indicator popped in the same paint as the remaining characters
//      of the preceding text snapping instantly into view.
//
// Text segments and boundary events share a single ordered `items` FIFO
// (not just one "open segment" slot). This matters because the producer
// (SSE parsing in use-assist.ts) keeps running ahead of the consumer
// (this module's reveal loop): a new text segment for a later round can
// start arriving on the wire before an earlier round's boundary event has
// even been dequeued yet. Tracking only one open segment at a time meant a
// later round's `extendTarget` call would silently replace the earlier
// round's still-revealing segment object, permanently freezing its DOM
// content mid-reveal and reordering the boundary event behind the wrong
// segment. The array below processes strictly head-first: only `items[0]`
// ever animates, and it's only removed once fully revealed and superseded
// by something else in the queue — so an arbitrary number of rounds can be
// in flight without merging or reordering.
//
// One instance is created per `POST /api/v1/assist` stream (see use-assist.ts)
// and torn down at done/error/abort.
// ---------------------------------------------------------------------------

export type BoundaryKind = 'tool_call' | 'tool_result' | 'confirm_required' | 'done';

export type StreamQueueDeps = {
  /** Write the currently-revealed slice of an open text segment into `turns` state. */
  updateTextSegment: (segmentId: string, content: string, streaming: boolean) => void;
};

export type StreamQueueHandle = {
  /**
   * Register/extend the target content for the currently-open text segment.
   * Called from the `text_delta` fast path — cheap, never gated. If the
   * given `segmentId` doesn't match the tail item (a new round has begun
   * while an earlier one is still resolving), a new segment is appended to
   * the chain rather than replacing what's already in flight.
   */
  extendTarget: (segmentId: string, fullContent: string) => void;
  /**
   * Queue a boundary event behind everything already queued ahead of it.
   * `run` performs the actual `setTurns` transition (and any side effects)
   * once every text segment ahead of it in wire order has fully revealed.
   */
  enqueue: (kind: BoundaryKind, run: () => void) => void;
  /** `error` bypass — apply immediately, ignoring queue/backlog entirely. */
  runImmediately: (run: () => void) => void;
  /**
   * Abort/stop: synchronously apply every queued item's end state, in
   * order — snapping any in-progress reveal to full target content, then
   * running each boundary's closure. Cancels timers.
   */
  flush: () => void;
  /** Cancel timers without running pending work — safety net for unmount. */
  destroy: () => void;
};

type TextItem = { kind: 'text'; id: string; target: string; revealed: number };
type BoundaryItem = { kind: 'boundary'; boundaryKind: BoundaryKind; run: () => void };
type QueueItem = TextItem | BoundaryItem;

// ---------------------------------------------------------------------------
// Pacing — continuous-ish function of backlog, with a lower/earlier hard-flush
// ceiling once something is already queued behind the open segment (that's
// the stronger "the gate is costing the user latency right now" signal).
// ---------------------------------------------------------------------------

const BASE_MS_PER_CHAR = 12; // matches the old static CHAR_MS baseline (R3: no regression)
const MIN_MS_PER_CHAR = 1;
const SOFT_BACKLOG = 30; // below this (and nothing waiting), stay at baseline pace
const RAMP_BACKLOG = 150; // backlog range over which pace ramps to MIN_MS_PER_CHAR
const HARD_FLUSH_BACKLOG = 400; // beyond this (rare), stop animating char-by-char and flush
const WAITING_RAMP_BACKLOG = 60; // faster ramp once something is waiting on us
const WAITING_HARD_FLUSH_BACKLOG = 200; // and a much lower flush ceiling — still high enough that
// an ordinary text->tool_call gap (a sentence or two of backlog) finishes as a fast catch-up
// reveal rather than an instant pop; only a genuinely large stall hits this cap (R9/C2/C11).

const MIN_INDICATOR_VISIBLE_MS = 500;

function computePace(backlog: number, waiting: boolean): { msPerChar: number; hardFlush: boolean } {
  const hardFlushBacklog = waiting ? WAITING_HARD_FLUSH_BACKLOG : HARD_FLUSH_BACKLOG;
  if (backlog >= hardFlushBacklog) {
    return { msPerChar: MIN_MS_PER_CHAR, hardFlush: true };
  }

  if (backlog <= SOFT_BACKLOG && !waiting) {
    return { msPerChar: BASE_MS_PER_CHAR, hardFlush: false };
  }

  const rampBacklog = waiting ? WAITING_RAMP_BACKLOG : RAMP_BACKLOG;
  const effectiveBacklog = waiting ? backlog : backlog - SOFT_BACKLOG;
  const t = Math.min(1, Math.max(0, effectiveBacklog) / rampBacklog);
  const msPerChar = BASE_MS_PER_CHAR - t * (BASE_MS_PER_CHAR - MIN_MS_PER_CHAR);
  return { msPerChar: Math.max(MIN_MS_PER_CHAR, msPerChar), hardFlush: false };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createStreamQueue(deps: StreamQueueDeps): StreamQueueHandle {
  const items: QueueItem[] = [];
  let indicatorShownAt: number | null = null;
  let rafId: number | null = null;
  let minHoldTimer: ReturnType<typeof setTimeout> | null = null;
  let lastTick = 0;
  let destroyed = false;

  function cancelTimers(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (minHoldTimer !== null) {
      clearTimeout(minHoldTimer);
      minHoldTimer = null;
    }
  }

  function ensureLoopRunning(): void {
    if (destroyed || rafId !== null) return;
    lastTick = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  /** Is there work this loop still needs to drive (animate or dequeue)? */
  function needsLoop(): boolean {
    const head = items[0];
    if (!head) return false;
    if (head.kind === 'text') {
      if (head.revealed < head.target.length) return true; // still animating
      return items.length > 1; // fully revealed but superseded — needs shifting
    }
    return true; // a boundary item always has work (run now, or resolve its min-hold)
  }

  function processPendingIfReady(): void {
    if (minHoldTimer !== null) return;

    while (items.length > 0) {
      const head = items[0];

      if (head.kind === 'text') {
        if (head.revealed < head.target.length) return; // still animating — wait for tick()
        if (items.length === 1) return; // fully revealed but still the live/open segment
        items.shift(); // fully revealed and superseded by something later — drop it
        continue;
      }

      if (head.boundaryKind === 'tool_result' && indicatorShownAt !== null) {
        const elapsed = performance.now() - indicatorShownAt;
        if (elapsed < MIN_INDICATOR_VISIBLE_MS) {
          const remaining = MIN_INDICATOR_VISIBLE_MS - elapsed;
          minHoldTimer = setTimeout(() => {
            minHoldTimer = null;
            processPendingIfReady();
            ensureLoopRunning();
          }, remaining);
          return;
        }
      }

      items.shift();
      head.run();

      if (head.boundaryKind === 'tool_call') {
        indicatorShownAt = performance.now();
      } else if (head.boundaryKind === 'tool_result') {
        indicatorShownAt = null;
      }
    }
  }

  function tick(now: number): void {
    rafId = null;
    if (destroyed) return;

    const elapsed = now - lastTick;
    lastTick = now;

    const head = items[0];
    if (head?.kind === 'text' && head.revealed < head.target.length) {
      const backlog = head.target.length - head.revealed;
      const waiting = items.length > 1;
      const { msPerChar, hardFlush } = computePace(backlog, waiting);

      const nextRevealed = hardFlush
        ? head.target.length
        : Math.min(head.target.length, head.revealed + Math.max(1, Math.floor(elapsed / msPerChar)));

      head.revealed = nextRevealed;
      const stillStreaming = !(items.length > 1 && nextRevealed >= head.target.length);
      deps.updateTextSegment(head.id, head.target.slice(0, nextRevealed), stillStreaming);
    }

    processPendingIfReady();

    if (needsLoop() && minHoldTimer === null) {
      rafId = requestAnimationFrame(tick);
    }
  }

  function extendTarget(segmentId: string, fullContent: string): void {
    if (destroyed) return;
    const tail = items[items.length - 1];
    if (tail && tail.kind === 'text' && tail.id === segmentId) {
      tail.target = fullContent;
    } else {
      items.push({ kind: 'text', id: segmentId, target: fullContent, revealed: 0 });
    }
    ensureLoopRunning();
  }

  function enqueue(kind: BoundaryKind, run: () => void): void {
    if (destroyed) return;
    items.push({ kind: 'boundary', boundaryKind: kind, run });
    // Try to resolve immediately (e.g. tool-call-only turns, no open segment
    // to wait on) — zero added latency in the common "nothing to gate" case.
    processPendingIfReady();
    if (needsLoop() && minHoldTimer === null) {
      ensureLoopRunning();
    }
  }

  function runImmediately(run: () => void): void {
    run();
  }

  function flush(): void {
    cancelTimers();
    while (items.length > 0) {
      const item = items.shift()!;
      if (item.kind === 'text') {
        deps.updateTextSegment(item.id, item.target, false);
      } else {
        item.run();
      }
    }
    indicatorShownAt = null;
  }

  function destroy(): void {
    destroyed = true;
    cancelTimers();
  }

  return { extendTarget, enqueue, runImmediately, flush, destroy };
}

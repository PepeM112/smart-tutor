// @vitest-environment jsdom

// Tests for AutosaveController (pure class, no React renderer needed), plus one hook test.
// Uses vitest fake timers to control debounce and retry delays.

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AutosaveController, useAutosave } from './useAutosave';

import type { SavePayload } from './useAutosave';

// ─── fixtures ────────────────────────────────────────────────────────────────

const NOTE_ID = 'test-note-id';
const INITIAL_VERSION = 1;

const payload: SavePayload = { title: 'My Note', content: '# Hello', tags: [] };
const payload2: SavePayload = { title: 'My Note', content: '# Hello world', tags: [] };

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeSaveFn(result: { version: number } = { version: 2 }) {
  return vi.fn().mockResolvedValue(result);
}

function makeController(saveFn = makeSaveFn()) {
  const statuses: string[] = [];
  const onStatus = vi.fn((s: string) => statuses.push(s));
  const controller = new AutosaveController(NOTE_ID, INITIAL_VERSION, onStatus, saveFn);
  return { controller, onStatus, statuses };
}

// ─── debounce ────────────────────────────────────────────────────────────────

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends exactly one request after a pause of >= 1 s', async () => {
    const saveFn = makeSaveFn();
    const { controller } = makeController(saveFn);

    controller.onChange(payload);
    controller.onChange(payload2);
    controller.onChange(payload);

    expect(saveFn).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);

    expect(saveFn).toHaveBeenCalledTimes(1);
    // Only the last payload is sent.
    expect(saveFn).toHaveBeenCalledWith(NOTE_ID, payload, INITIAL_VERSION, false);
  });

  it('rapid typing does not send parallel requests', async () => {
    const saveFn = makeSaveFn();
    const { controller } = makeController(saveFn);

    // Simulate 5 keystrokes spaced 200 ms apart (total 1 s, no pause > 1 s)
    for (let i = 0; i < 5; i++) {
      controller.onChange(payload);
      await vi.advanceTimersByTimeAsync(200);
    }

    // Debounce window resets each time — no save yet.
    expect(saveFn).not.toHaveBeenCalled();

    // After a final 1 s pause, exactly one save.
    await vi.advanceTimersByTimeAsync(1000);
    expect(saveFn).toHaveBeenCalledTimes(1);
  });
});

// ─── coalescing ──────────────────────────────────────────────────────────────

describe('no parallel requests + coalescing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces edits made during a save into one follow-up', async () => {
    let resolveFirst!: (v: { version: number }) => void;
    const firstSave = new Promise<{ version: number }>(res => {
      resolveFirst = res;
    });
    const saveFn = vi.fn().mockReturnValueOnce(firstSave).mockResolvedValue({ version: 3 });
    const { controller } = makeController(saveFn);

    // Trigger first save.
    controller.onChange(payload);
    await vi.advanceTimersByTimeAsync(1000);
    expect(saveFn).toHaveBeenCalledTimes(1);

    // Make another edit while the first save is in-flight.
    controller.onChange(payload2);

    // Resolve the first save.
    resolveFirst({ version: 2 });
    await vi.advanceTimersByTimeAsync(0); // flush microtasks

    // The follow-up save should be triggered immediately (no extra debounce).
    await vi.advanceTimersByTimeAsync(0);
    expect(saveFn).toHaveBeenCalledTimes(2);
    expect(saveFn).toHaveBeenLastCalledWith(NOTE_ID, payload2, 2, false);
  });
});

// ─── flush ────────────────────────────────────────────────────────────────────

describe('flush', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('flushes pending changes immediately without waiting for the debounce', async () => {
    const saveFn = makeSaveFn();
    const { controller, statuses } = makeController(saveFn);

    controller.onChange(payload);
    expect(saveFn).not.toHaveBeenCalled();

    await controller.flush();
    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(statuses).toContain('saving');
    expect(statuses).toContain('saved');
  });

  it('flush with no pending changes does nothing', async () => {
    const saveFn = makeSaveFn();
    const { controller } = makeController(saveFn);
    await controller.flush();
    expect(saveFn).not.toHaveBeenCalled();
  });
});

// ─── version tracking ────────────────────────────────────────────────────────

describe('version tracking', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('updates the version from each successful response', async () => {
    const saveFn = makeSaveFn({ version: 5 });
    const { controller } = makeController(saveFn);

    expect(controller.getVersion()).toBe(INITIAL_VERSION);

    controller.onChange(payload);
    await controller.flush();

    expect(controller.getVersion()).toBe(5);
  });

  it('sends the current version in subsequent saves', async () => {
    const saveFn = vi.fn().mockResolvedValueOnce({ version: 2 }).mockResolvedValue({ version: 3 });
    const { controller } = makeController(saveFn);

    controller.onChange(payload);
    await controller.flush();
    expect(saveFn).toHaveBeenCalledWith(NOTE_ID, payload, 1, false);

    controller.onChange(payload2);
    await controller.flush();
    expect(saveFn).toHaveBeenCalledWith(NOTE_ID, payload2, 2, false);
  });
});

// ─── retry on error ───────────────────────────────────────────────────────────

describe('retry on network/5xx error', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries after a backoff delay and eventually succeeds', async () => {
    const saveFn = vi.fn().mockRejectedValueOnce(new Error('Network error')).mockResolvedValue({ version: 2 });
    const { controller, statuses } = makeController(saveFn);

    controller.onChange(payload);
    await controller.flush();

    expect(statuses).toContain('error');
    expect(saveFn).toHaveBeenCalledTimes(1);

    // Advance past the retry delay (1s * 2^1 = 2 s).
    await vi.advanceTimersByTimeAsync(2000);

    expect(saveFn).toHaveBeenCalledTimes(2);
    expect(statuses[statuses.length - 1]).toBe('saved');
  });

  it('retries a 5xx error', async () => {
    const saveFn = vi.fn().mockRejectedValueOnce({ status: 503 }).mockResolvedValue({ version: 2 });
    const { controller } = makeController(saveFn);

    controller.onChange(payload);
    await controller.flush();
    await vi.advanceTimersByTimeAsync(2000);

    expect(saveFn).toHaveBeenCalledTimes(2);
  });
});

// ─── non-retryable 4xx ───────────────────────────────────────────────────────

describe('non-retryable 4xx error', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    [404, 'error'],
    [422, 'invalid'],
  ])('does not retry a %i error (status %s)', async (status, expected) => {
    const saveFn = vi.fn().mockRejectedValue({ status });
    const { controller, statuses } = makeController(saveFn);

    controller.onChange(payload);
    await controller.flush();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(statuses[statuses.length - 1]).toBe(expected);
  });

  it('keeps the edits, so a manual retry sends them again', async () => {
    const saveFn = vi.fn().mockRejectedValueOnce({ status: 422 }).mockResolvedValue({ version: 2 });
    const { controller, statuses } = makeController(saveFn);

    controller.onChange(payload);
    await controller.flush();
    await controller.flush(); // Retry button

    expect(saveFn).toHaveBeenCalledTimes(2);
    expect(saveFn).toHaveBeenLastCalledWith(NOTE_ID, payload, INITIAL_VERSION, false);
    expect(statuses[statuses.length - 1]).toBe('saved');
  });
});

// ─── dispose ─────────────────────────────────────────────────────────────────

describe('dispose', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the final flush once but does not retry it', async () => {
    const saveFn = vi.fn().mockRejectedValue(new Error('Network error'));
    const { controller } = makeController(saveFn);

    controller.onChange(payload);
    const final = controller.flush(true);
    controller.dispose();
    await final;
    await vi.advanceTimersByTimeAsync(60_000);

    expect(saveFn).toHaveBeenCalledTimes(1);
  });

  it('cancels a retry that was already scheduled', async () => {
    const saveFn = vi.fn().mockRejectedValue(new Error('Network error'));
    const { controller } = makeController(saveFn);

    controller.onChange(payload);
    await controller.flush();
    controller.dispose();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(saveFn).toHaveBeenCalledTimes(1);
  });
});

// ─── 409 → conflict ───────────────────────────────────────────────────────────

describe('409 conflict', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops retrying and sets status to conflict on 409', async () => {
    const conflictError = { status: 409, message: 'Conflict' };
    const saveFn = vi.fn().mockRejectedValue(conflictError);
    const { controller, statuses } = makeController(saveFn);

    controller.onChange(payload);
    await controller.flush();

    expect(statuses).toContain('conflict');
    expect(saveFn).toHaveBeenCalledTimes(1);

    // Advance time — no further retries should happen.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(saveFn).toHaveBeenCalledTimes(1);
  });

  it('ignores onChange calls while in conflict state', async () => {
    const conflictError = { status: 409, message: 'Conflict' };
    const saveFn = vi.fn().mockRejectedValue(conflictError);
    const { controller, statuses } = makeController(saveFn);

    controller.onChange(payload);
    await controller.flush();

    // Try to make another change while conflicted.
    controller.onChange(payload2);
    await vi.advanceTimersByTimeAsync(5000);

    // Still only one save attempt.
    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(statuses[statuses.length - 1]).toBe('conflict');
  });
});

// ─── reindex on leave ────────────────────────────────────────────────────────

describe('reindex on leave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends a reindex-only request when leaving after the last save completed', async () => {
    const saveFn = makeSaveFn();
    const { controller } = makeController(saveFn);

    controller.onChange(payload);
    await vi.advanceTimersByTimeAsync(1000);
    await controller.flush(true);

    expect(saveFn).toHaveBeenCalledTimes(2);
    expect(saveFn).toHaveBeenLastCalledWith(NOTE_ID, null, 2, true);
  });

  it('does not reindex when nothing was saved since the last reindex', async () => {
    const saveFn = makeSaveFn();
    const { controller } = makeController(saveFn);

    await controller.flush(true);
    controller.onChange(payload);
    await controller.flush(true);
    await controller.flush(true);

    // One save that carried reindex: true, then nothing.
    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(saveFn).toHaveBeenCalledWith(NOTE_ID, payload, 1, true);
  });

  it('flushSync sends pending edits with keepalive and reindex', () => {
    const saveFn = makeSaveFn();
    const { controller } = makeController(saveFn);

    controller.onChange(payload);
    controller.flushSync();

    expect(saveFn).toHaveBeenCalledWith(NOTE_ID, payload, 1, true, true);
  });

  it('a flush after flushSync sends nothing (no second reindex PATCH)', async () => {
    const saveFn = makeSaveFn();
    const { controller } = makeController(saveFn);

    controller.onChange(payload);
    controller.flushSync();
    await controller.flush(true);

    expect(saveFn).toHaveBeenCalledTimes(1);
  });
});

// ─── conflict resolution ─────────────────────────────────────────────────────

describe('reset after conflict', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts new edits with the server version after reset', async () => {
    const saveFn = vi.fn().mockRejectedValueOnce({ status: 409 }).mockResolvedValue({ version: 8 });
    const { controller, statuses } = makeController(saveFn);

    controller.onChange(payload);
    await controller.flush();
    expect(statuses[statuses.length - 1]).toBe('conflict');

    controller.reset(7);
    controller.onChange(payload2);
    await controller.flush();

    expect(saveFn).toHaveBeenLastCalledWith(NOTE_ID, payload2, 7, false);
    expect(statuses[statuses.length - 1]).toBe('saved');
  });
});

// ─── hook ────────────────────────────────────────────────────────────────────

describe('useAutosave hook', () => {
  it('keeps the same callbacks when the status changes', () => {
    const { result } = renderHook(() => useAutosave(NOTE_ID, INITIAL_VERSION, undefined, makeSaveFn()));
    const first = result.current;

    act(() => first.onChange(payload));

    expect(result.current.status).toBe('dirty');
    expect(result.current.onChange).toBe(first.onChange);
    expect(result.current.flush).toBe(first.flush);
    expect(result.current.reset).toBe(first.reset);
  });
});

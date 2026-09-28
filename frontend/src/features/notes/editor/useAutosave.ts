'use client';

// Autosave hook for the note editor.
//
// Behaviour:
//   - Debounces saves 1 s after the last change.
//   - Only one PATCH in-flight at a time; edits made during a save are
//     coalesced into one follow-up save.
//   - Flush is called on blur, visibilitychange→hidden, unmount, and
//     beforeunload. Leaving the note (hidden / unmount / unload) also asks the
//     server to reindex embeddings, but only if a save happened since the last
//     reindex — autosave itself never re-embeds (see docs/ai-features.md).
//   - Retries network/5xx/408/429 errors with exponential backoff (max 30 s).
//     Other 4xx errors cannot succeed on retry: no timer. A 422 sets status
//     'invalid' (the payload is over a backend limit, in practice the content
//     length), other codes set 'error'. The next edit or the Retry button sends
//     the save again.
//   - After `dispose()` (unmount), a failed save is not retried.
//   - On 409 (optimistic concurrency mismatch), stops and sets status
//     'conflict'. The caller must handle the banner.
//   - Tracks the server version and updates it from each successful response.
//
// The core logic lives in AutosaveController (pure class, no React) so it
// can be tested with vitest fake timers without a DOM or React renderer.

import { useEffect, useMemo, useRef, useState } from 'react';

import type { NoteRead } from '@/client';
import { sdk } from '@/lib/apiClient';

// ─── types ───────────────────────────────────────────────────────────────────

export type AutosaveStatus = 'saved' | 'saving' | 'dirty' | 'error' | 'invalid' | 'conflict';

export type SavePayload = {
  title: string;
  content: string;
  tags: string[];
};

// `payload: null` = reindex-only request. `keepalive` lets the request outlive page unload.
type SaveFn = (
  noteId: string,
  payload: SavePayload | null,
  version: number,
  reindex: boolean,
  keepalive?: boolean
) => Promise<NoteRead>;

// ─── AutosaveController ───────────────────────────────────────────────────────

/**
 * Pure autosave controller with no React dependency.
 * Testable with vitest fake timers via the `saveFn` injection point.
 */
export class AutosaveController {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight = false;
  private latestPayload: SavePayload | null = null;
  private pendingReindex = false;
  // True when the server holds content that is not embedded yet.
  private needsReindex = false;
  private retryCount = 0;
  private currentStatus: AutosaveStatus = 'saved';
  private version: number;
  private disposed = false;

  constructor(
    private readonly noteId: string,
    initialVersion: number,
    private readonly onStatus: (s: AutosaveStatus) => void,
    private readonly saveFn: SaveFn,
    private readonly onSaved?: (note: NoteRead) => void
  ) {
    this.version = initialVersion;
  }

  getVersion(): number {
    return this.version;
  }

  /** Drop pending edits and leave the conflict state, e.g. after Reload / Keep mine. */
  reset(version: number): void {
    this.clearTimer();
    this.latestPayload = null;
    this.pendingReindex = false;
    this.retryCount = 0;
    this.version = version;
    this.setStatus('saved');
  }

  /** Call on every editor/title/tag change. */
  onChange(payload: SavePayload): void {
    if (this.currentStatus === 'conflict') return;
    this.latestPayload = payload;
    if (this.inflight) {
      // Coalesce: the follow-up save will pick up latestPayload.
      this.setStatus('dirty');
      return;
    }
    this.clearTimer();
    this.setStatus('dirty');
    this.timer = setTimeout(() => {
      void this.executeSave(false);
    }, 1000);
  }

  /** Flush pending changes immediately. Pass `reindex: true` when leaving the note. */
  async flush(reindex = false): Promise<void> {
    if (this.currentStatus === 'conflict') return;
    this.clearTimer();
    if (this.inflight) {
      // The running save sends a follow-up with this flag when it finishes.
      this.pendingReindex = this.pendingReindex || reindex;
      return;
    }
    if (this.latestPayload) {
      await this.executeSave(reindex);
    } else if (reindex && this.needsReindex) {
      await this.executeReindexOnly();
    }
  }

  /**
   * Fire-and-forget flush for `beforeunload`. The page is going away, so the
   * response (new version) is not needed — only that the browser sends it.
   */
  flushSync(): void {
    if (this.currentStatus === 'conflict') return;
    this.clearTimer();
    if (!this.latestPayload && !this.needsReindex) return;
    void this.saveFn(this.noteId, this.latestPayload, this.version, true, true).catch(() => undefined);
  }

  /**
   * Stop scheduling retries. A save that is already running still completes.
   * Call on unmount: nothing owns the controller after that, so a retry loop would
   * run for the rest of the session.
   */
  dispose(): void {
    this.disposed = true;
    this.clearTimer();
  }

  // ── private ────────────────────────────────────────────────────────────────

  private setStatus(s: AutosaveStatus) {
    this.currentStatus = s;
    this.onStatus(s);
  }

  private clearTimer() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async executeSave(reindex: boolean): Promise<void> {
    if (!this.latestPayload) return;

    const payload = this.latestPayload;
    this.inflight = true;
    this.setStatus('saving');

    try {
      const result = await this.saveFn(this.noteId, payload, this.version, reindex);
      this.version = result.version;
      this.retryCount = 0;
      this.needsReindex = !reindex;
      this.inflight = false;
      this.onSaved?.(result);

      const shouldReindex = this.pendingReindex;
      this.pendingReindex = false;
      if (this.latestPayload !== payload) {
        // Edits arrived during this save — send a follow-up.
        await this.executeSave(shouldReindex);
        return;
      }
      this.latestPayload = null;
      this.setStatus('saved');
      if (shouldReindex && this.needsReindex) await this.executeReindexOnly();
    } catch (err: unknown) {
      this.inflight = false;
      if (isConflictError(err)) {
        this.setStatus('conflict');
        return;
      }
      // Keep the local edits in all cases. Retry only errors that can go away by themselves.
      if (this.disposed || !isRetryableError(err)) {
        this.setStatus(errorStatus(err) === 422 ? 'invalid' : 'error');
        return;
      }
      this.retryCount++;
      const delay = Math.min(1000 * 2 ** this.retryCount, 30_000);
      this.setStatus('error');
      this.timer = setTimeout(() => {
        void this.executeSave(reindex);
      }, delay);
    }
  }

  // Best effort: a failed reindex is caught up by the lazy indexing before search.
  private async executeReindexOnly(): Promise<void> {
    this.inflight = true;
    try {
      await this.saveFn(this.noteId, null, this.version, true);
      this.needsReindex = false;
    } catch {
      // Ignore — see comment above.
    } finally {
      this.inflight = false;
    }
    if (this.latestPayload && !this.timer) await this.executeSave(false);
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/** HTTP status added by the error interceptor in `lib/apiClient.ts`. `null` = no response (network error). */
function errorStatus(err: unknown): number | null {
  if (err && typeof err === 'object' && 'status' in err && typeof err.status === 'number') {
    return err.status;
  }
  return null;
}

function isConflictError(err: unknown): boolean {
  return errorStatus(err) === 409;
}

const RETRYABLE_4XX = new Set([408, 429]);

function isRetryableError(err: unknown): boolean {
  const status = errorStatus(err);
  return status === null || status >= 500 || RETRYABLE_4XX.has(status);
}

/** Default save function using the generated SDK. */
async function apiSave(
  noteId: string,
  payload: SavePayload | null,
  version: number,
  reindex: boolean,
  keepalive = false
): Promise<NoteRead> {
  const res = await sdk.notesUpdate({
    path: { note_id: noteId },
    body: { ...payload, version, ...(reindex && { reindex: true }) },
    keepalive,
    throwOnError: true,
  });
  return res.data;
}

// ─── React hook ───────────────────────────────────────────────────────────────

export type UseAutosaveReturn = {
  status: AutosaveStatus;
  /** Call with the full current note payload on every change. */
  onChange: (payload: SavePayload) => void;
  /** Flush pending changes. Pass `reindex: true` when leaving the note. */
  flush: (reindex?: boolean) => Promise<void>;
  /** Drop pending edits and continue from `version` (conflict resolution). */
  reset: (version: number) => void;
};

/**
 * Thin React wrapper around `AutosaveController`.
 * Registers visibilitychange and beforeunload handlers automatically.
 */
export function useAutosave(
  noteId: string,
  initialVersion: number,
  onSaved?: (note: NoteRead) => void,
  saveFn: SaveFn = apiSave
): UseAutosaveReturn {
  const [status, setStatus] = useState<AutosaveStatus>('saved');
  const controllerRef = useRef<AutosaveController | null>(null);
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  useEffect(() => {
    const controller = new AutosaveController(noteId, initialVersion, setStatus, saveFn, note =>
      onSavedRef.current?.(note)
    );
    controllerRef.current = controller;

    // The page is still alive when hidden, so a normal save keeps the version in sync.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') void controller.flush(true);
    };
    const handleBeforeUnload = () => controller.flushSync();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Client-side navigation: JS keeps running, so the async flush completes after unmount.
      // `dispose` runs right after: the final save is sent once, but it is not retried.
      void controller.flush(true);
      controller.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  return useMemo(
    () => ({
      status,
      onChange: (payload: SavePayload) => controllerRef.current?.onChange(payload),
      flush: (reindex = false) => controllerRef.current?.flush(reindex) ?? Promise.resolve(),
      reset: (version: number) => controllerRef.current?.reset(version),
    }),
    [status]
  );
}

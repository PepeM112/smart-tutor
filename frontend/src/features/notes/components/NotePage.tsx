'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { type NoteRead } from '@/client';
import { QueryState } from '@/components/shared/QueryState';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { DiffNoteContent, DiffPanel } from '@/features/assist/components/diff';
import { useProvidePageData } from '@/features/assist/hooks/useProvidePageData';
import { useAssistAttachmentsStore } from '@/features/assist/store/useAssistAttachmentsStore';
import { useAssistDiffStore } from '@/features/assist/store/useAssistDiffStore';
import { useAssistPanelStore } from '@/features/assist/store/useAssistPanelStore';
import { formatNoteDetail } from '@/features/assist/utils/formatPageData';
import { useAiAvailable } from '@/hooks/useAiAvailable';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useResizableSplit } from '@/hooks/useResizableSplit';
import { sdk } from '@/lib/apiClient';
import { noteHref } from '@/lib/routes';

import { RichNoteEditor, type RichNoteEditorRef } from '../editor/RichNoteEditor';
import { type AutosaveStatus, type SavePayload, useAutosave } from '../editor/useAutosave';
import { useChunkAiEdit } from '../editor/useChunkAiEdit';

import { TagInput } from './TagInput';

import type { SelectionContext } from '../editor/NoteBubbleMenu';

type Props = {
  noteId: string;
  /** Full URL param (may include slug prefix). Used for canonical URL redirect. */
  rawParam: string;
};

export function NotePage({ noteId, rawParam }: Props) {
  const t = useTranslations();
  const {
    data: note,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['notes', noteId],
    queryFn: () => sdk.notesGet({ path: { note_id: noteId } }),
    refetchOnWindowFocus: true,
  });

  const noteData = note?.data;
  useProvidePageData(useMemo(() => (noteData ? formatNoteDetail(noteData) : null), [noteData]));

  return (
    <QueryState isLoading={isLoading} isError={isError} errorMessage={t('notes.failed_to_load_note')}>
      {noteData ? (
        <NoteForm note={noteData} rawParam={rawParam} />
      ) : (
        <p className="text-muted-foreground">{t('notes.note_not_found')}</p>
      )}
    </QueryState>
  );
}

const ASSIST_DIFF_SPLIT_KEY = 'assist-diff-split-ratio';

function NoteForm({ note, rawParam }: { note: NoteRead; rawParam: string }) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { isDesktop } = useBreakpoint();
  const searchParams = useSearchParams();

  const editorRef = useRef<RichNoteEditorRef>(null);
  const [title, setTitle] = useState(note.title);
  const [tags, setTags] = useState<string[]>(note.tags ?? []);
  const [content, setContent] = useState(note.content ?? '');

  // Keep current field values accessible in stable callbacks.
  const titleRef = useRef(title);
  const tagsRef = useRef(tags);
  const contentRef = useRef(content);
  useEffect(() => {
    titleRef.current = title;
  }, [title]);
  useEffect(() => {
    tagsRef.current = tags;
  }, [tags]);
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  const buildPayload = useCallback(
    (): SavePayload => ({
      title: titleRef.current,
      content: contentRef.current,
      tags: tagsRef.current,
    }),
    []
  );

  // Highest version this page knows the server has — our own saves included.
  const knownVersion = useRef(note.version);

  const handleSaved = useCallback(
    (saved: NoteRead) => {
      knownVersion.current = saved.version;
      // Patch the cache instead of refetching, so the editor never remounts.
      queryClient.setQueryData<{ data: NoteRead }>(['notes', note.id], old => (old ? { ...old, data: saved } : old));
      void queryClient.invalidateQueries({ queryKey: ['notes'], refetchType: 'none' });
    },
    [queryClient, note.id]
  );

  const { status, onChange, flush, reset } = useAutosave(note.id, note.version, handleSaved);
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // ── AI chunk edit ────────────────────────────────────────────────────────────

  const aiAvailable = useAiAvailable();
  const addAttachment = useAssistAttachmentsStore(s => s.addAttachment);
  const setActiveCommand = useAssistAttachmentsStore(s => s.setActiveCommand);
  const setAssistOpen = useAssistPanelStore(s => s.setOpen);

  const {
    pendingSelection,
    isPending: isChunkPending,
    activeDiff: chunkDiff,
    handleAskAi,
    submitInstructions,
    cancelInstructions,
    handleAcceptDiff: acceptChunkDiff,
    handleRejectDiff: rejectChunkDiff,
  } = useChunkAiEdit({ editorRef, noteId: note.id });

  const handleSendToAssistant = useCallback(
    (ctx: SelectionContext) => {
      addAttachment({
        type: 'note_chunk',
        label: t('notes_ai.note_text'),
        content: ctx.markdown,
        metadata: {
          noteId: note.id,
          plainText: ctx.plainText,
          pmFrom: ctx.from,
          pmTo: ctx.to,
        },
      });
      setActiveCommand('/edit-note');
      setAssistOpen(true);
    },
    [note.id, addAttachment, setActiveCommand, setAssistOpen, t]
  );

  const notifyChange = useCallback(() => {
    onChange(buildPayload());
  }, [onChange, buildPayload]);

  // Replace local state with the server copy. `reset` runs after `setMarkdown`
  // so the change event that `setMarkdown` emits does not schedule a save.
  const applyServerNote = useCallback(
    (fresh: NoteRead) => {
      setTitle(fresh.title);
      setTags(fresh.tags ?? []);
      setContent(fresh.content ?? '');
      editorRef.current?.setMarkdown(fresh.content ?? '');
      reset(fresh.version);
      knownVersion.current = fresh.version;
    },
    [reset]
  );

  // A window-focus refetch brought a newer version from another tab/device.
  // Apply it only when there are no local edits; otherwise the next save gets a 409.
  useEffect(() => {
    if (note.version <= knownVersion.current || statusRef.current !== 'saved') return;
    applyServerNote(note);
  }, [note, applyServerNote]);

  const fetchServerNote = async (): Promise<NoteRead | null> => {
    try {
      const res = await sdk.notesGet({ path: { note_id: note.id } });
      return res.data ?? null;
    } catch {
      toast.error(t('notes.failed_to_load_note'));
      return null;
    }
  };

  const handleReload = async () => {
    const fresh = await fetchServerNote();
    if (fresh) applyServerNote(fresh);
  };

  // Keep mine: continue from the server version and re-send the local content.
  const handleKeepMine = async () => {
    const fresh = await fetchServerNote();
    if (!fresh) return;
    reset(fresh.version);
    knownVersion.current = fresh.version;
    onChange(buildPayload());
  };

  // Canonical URL: history.replaceState changes only the address bar. A router
  // navigation to a new [id] param value could remount the page and the editor.
  useEffect(() => {
    const canonical = noteHref({ id: note.id, title });
    if (window.location.pathname !== canonical) {
      window.history.replaceState(window.history.state, '', canonical + window.location.search);
    }
  }, [note.id, title, rawParam]);

  // Assist diff integration.
  const pendingNoteDiff = useAssistDiffStore(s => s.pendingNoteDiff);
  const clearPendingNoteDiff = useAssistDiffStore(s => s.clearPendingNoteDiff);
  const showAssistDiff = searchParams.get('diff') === 'assist' && pendingNoteDiff?.noteId === note.id;

  const {
    containerRef: assistDiffContainerRef,
    splitRatio: assistDiffRatio,
    handleDividerMouseDown: assistDiffDividerDown,
    resetRatio: assistDiffResetRatio,
  } = useResizableSplit(ASSIST_DIFF_SPLIT_KEY, 0.5);

  // Accept AI refinement — update editor in place, no remount.
  function acceptRefinement() {
    if (!pendingNoteDiff) return;
    const newContent = pendingNoteDiff.newContent;
    setContent(newContent);
    editorRef.current?.setMarkdown(newContent);
    clearPendingNoteDiff();
    // setMarkdown calls onChange internally, which triggers autosave.
  }

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      {/* Top row: save status only (Notion keeps page chrome out of the text column) */}
      <div className="flex h-6 shrink-0 items-center justify-end">
        <SaveStatus status={status} onRetry={() => void flush()} />
      </div>

      <div ref={assistDiffContainerRef} className="flex flex-1 min-h-0 overflow-hidden gap-0">
        <div
          className="min-w-0 flex-1 overflow-y-auto"
          style={{ flex: isDesktop && (showAssistDiff || !!chunkDiff) ? assistDiffRatio : 1 }}
        >
          {/* Centered text column — title, tags and body scroll together */}
          <div className="mx-auto w-full max-w-[720px] px-4 pb-24 md:px-6">
            <input
              type="text"
              value={title}
              onChange={e => {
                setTitle(e.target.value);
                titleRef.current = e.target.value;
                notifyChange();
              }}
              placeholder={t('notes.untitled')}
              className="note-title w-full bg-transparent text-foreground placeholder:text-muted-foreground/50 outline-none border-none focus:ring-0 p-0"
            />
            <div className="mt-2 mb-6">
              <TagInput
                tags={tags}
                onChange={next => {
                  setTags(next);
                  tagsRef.current = next;
                  notifyChange();
                }}
              />
            </div>

            {status === 'conflict' && <ConflictBanner onReload={handleReload} onKeepMine={handleKeepMine} />}

            <RichNoteEditor
              editorRef={editorRef}
              initialContent={content}
              onChange={md => {
                setContent(md);
                contentRef.current = md;
                notifyChange();
              }}
              onBlur={() => void flush()}
              onAskAi={aiAvailable ? handleAskAi : undefined}
              onSendToAssistant={aiAvailable ? handleSendToAssistant : undefined}
            />
          </div>
        </div>

        {/* Desktop: side diff panel (AI chunk edit or AI refine, mutually exclusive) */}
        {isDesktop && (chunkDiff ?? (showAssistDiff && pendingNoteDiff ? pendingNoteDiff : null)) && (
          <>
            <div
              className="shrink-0 relative flex items-center justify-center w-5 mx-2 cursor-col-resize"
              onMouseDown={assistDiffDividerDown}
              onDoubleClick={assistDiffResetRatio}
            >
              <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-border" />
              <div className="relative z-10 w-3 h-7 rounded-full border border-border bg-background" />
            </div>
            <div
              className="min-w-0 overflow-hidden rounded-xl border border-border bg-card"
              style={{ flex: 1 - assistDiffRatio }}
            >
              {chunkDiff ? (
                <DiffPanel title={t('notes_ai.changes')} onAccept={acceptChunkDiff} onReject={rejectChunkDiff}>
                  <DiffNoteContent oldContent={chunkDiff.originalMarkdown} newContent={chunkDiff.editedText} />
                </DiffPanel>
              ) : pendingNoteDiff ? (
                <DiffPanel title={t('notes_ai.changes')} onAccept={acceptRefinement} onReject={clearPendingNoteDiff}>
                  <DiffNoteContent oldContent={pendingNoteDiff.oldContent} newContent={pendingNoteDiff.newContent} />
                </DiffPanel>
              ) : null}
            </div>
          </>
        )}
      </div>

      {/* Mobile: chunk diff drawer */}
      {!isDesktop && (
        <Drawer open={!!chunkDiff} onOpenChange={open => !open && rejectChunkDiff()}>
          <DrawerContent className="max-h-[75dvh]">
            <div className="overflow-y-auto px-4 pb-8">
              {chunkDiff && (
                <DiffPanel title={t('notes_ai.changes')} onAccept={acceptChunkDiff} onReject={rejectChunkDiff}>
                  <DiffNoteContent oldContent={chunkDiff.originalMarkdown} newContent={chunkDiff.editedText} />
                </DiffPanel>
              )}
            </div>
          </DrawerContent>
        </Drawer>
      )}

      {/* Instruction popover — anchored below the selection rect */}
      {pendingSelection && (
        <InstructionPopover
          rect={pendingSelection.rect}
          isPending={isChunkPending}
          onSubmit={submitInstructions}
          onCancel={cancelInstructions}
        />
      )}
    </div>
  );
}

// ─── sub-components ───────────────────────────────────────────────────────────

function SaveStatus({ status, onRetry }: { status: AutosaveStatus; onRetry: () => void }) {
  const t = useTranslations('notes');

  if (status === 'saved') return null;

  return (
    <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
      {status === 'saving' && (
        <>
          <Loader2 className="size-3 animate-spin" />
          <span>{t('saving')}</span>
        </>
      )}
      {status === 'dirty' && <span>{t('saving')}</span>}
      {status === 'error' && (
        <>
          <AlertCircle className="size-3 text-destructive" />
          <span className="text-destructive">{t('failed_to_save')}</span>
          <button type="button" onClick={onRetry} className="text-primary underline hover:no-underline">
            {t('retry')}
          </button>
        </>
      )}
    </div>
  );
}

// ─── InstructionPopover ───────────────────────────────────────────────────────

type InstructionPopoverProps = {
  rect: DOMRect;
  isPending: boolean;
  onSubmit: (instructions: string) => void;
  onCancel: () => void;
};

function InstructionPopover({ rect, isPending, onSubmit, onCancel }: InstructionPopoverProps) {
  const t = useTranslations('notes_ai');
  const [instructions, setInstructions] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on a click outside. Not while the request runs: the result would then
  // arrive with no visible sign that it was still loading.
  useEffect(() => {
    if (isPending) return undefined;
    const handlePointerDown = (e: PointerEvent) => {
      if (!popoverRef.current?.contains(e.target as Node)) onCancel();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isPending, onCancel]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && instructions.trim()) onSubmit(instructions.trim());
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        top: rect.bottom + 6,
        left: Math.min(rect.left, window.innerWidth - 320),
        zIndex: 60,
      }}
      className="flex items-center gap-1.5 rounded-lg border border-border bg-background p-1.5 shadow-md"
    >
      <input
        autoFocus
        type="text"
        value={instructions}
        onChange={e => setInstructions(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('instructions_placeholder')}
        className="h-7 w-64 rounded border border-border bg-background px-2 text-xs outline-none focus:border-primary"
        disabled={isPending}
      />
      <Button
        size="sm"
        variant="default"
        className="h-7 px-2 text-xs"
        disabled={!instructions.trim() || isPending}
        onClick={() => onSubmit(instructions.trim())}
      >
        {isPending ? <Loader2 className="size-3 animate-spin" /> : t('edit')}
      </Button>
    </div>
  );
}

function ConflictBanner({ onReload, onKeepMine }: { onReload: () => Promise<void>; onKeepMine: () => Promise<void> }) {
  const t = useTranslations('notes');
  const [isKeeping, setIsKeeping] = useState(false);

  const handleKeepMine = async () => {
    setIsKeeping(true);
    try {
      await onKeepMine();
    } finally {
      setIsKeeping(false);
    }
  };

  return (
    <div className="mb-3 flex items-center gap-3 rounded-lg border border-border bg-muted px-4 py-2.5 text-sm">
      <AlertCircle className="size-4 shrink-0 text-destructive" />
      <span className="flex-1 text-foreground">{t('conflict_banner')}</span>
      <Button size="sm" variant="outline" onClick={() => void onReload()} icon={RefreshCw}>
        {t('reload')}
      </Button>
      <Button size="sm" variant="ghost" onClick={handleKeepMine} disabled={isKeeping}>
        {t('keep_mine')}
      </Button>
    </div>
  );
}

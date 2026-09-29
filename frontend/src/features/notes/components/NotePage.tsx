'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { posToDOMRect } from '@tiptap/core';
import { AlertCircle, BookOpen, FolderInput, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { type NoteRead } from '@/client';
import { QueryState } from '@/components/shared/QueryState';
import { SplitPane } from '@/components/shared/SplitPane';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { FloatingCard, FloatingCardAnchor, FloatingCardContent } from '@/components/ui/floating-card';
import { DiffNoteContent, DiffPanel } from '@/features/assist/components/diff';
import { useAssistCoversPage } from '@/features/assist/hooks/useAssistCoversPage';
import { useProvidePageData } from '@/features/assist/hooks/useProvidePageData';
import { useAssistAttachmentsStore } from '@/features/assist/store/useAssistAttachmentsStore';
import { useAssistDiffStore } from '@/features/assist/store/useAssistDiffStore';
import { useAssistPanelStore } from '@/features/assist/store/useAssistPanelStore';
import { formatNoteDetail } from '@/features/assist/utils/formatPageData';
import { FileBreadcrumb } from '@/features/files/components/FileBreadcrumb';
import { FilePageShell } from '@/features/files/components/FilePageShell';
import { MoveDialog } from '@/features/files/components/MoveDialog';
import { useFolderPath } from '@/features/files/hooks/useFolderPath';
import { useAiAvailable } from '@/hooks/useAiAvailable';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { sdk } from '@/lib/apiClient';
import { noteHref } from '@/lib/routes';
import { cn, getErrorDetail } from '@/lib/utils';

import { RichNoteEditor, type RichNoteEditorRef } from '../editor/RichNoteEditor';
import { type AutosaveStatus } from '../editor/useAutosave';
import { useChunkAiEdit } from '../editor/useChunkAiEdit';
import { useNoteDraft } from '../hooks/useNoteDraft';
import { useNoteWidth } from '../hooks/useNoteWidth';

import { TagInput } from './TagInput';

import type { SelectionContext } from '../editor/NoteBubbleMenu';
import type { EditorView } from '@tiptap/pm/view';

type Props = {
  noteId: string;
};

export function NotePage({ noteId }: Props) {
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
        noteData.deletedAt ? (
          <TrashedNoteView key={noteData.id} note={noteData} />
        ) : (
          <NoteForm key={noteData.id} note={noteData} />
        )
      ) : (
        <p className="text-muted-foreground">{t('notes.note_not_found')}</p>
      )}
    </QueryState>
  );
}

// ─── TrashedNoteView ──────────────────────────────────────────────────────────
// Rendered instead of NoteForm when note.deletedAt is set.
// No autosave, no AI actions, no move — just a read-only editor + trash banner.

function TrashedNoteView({ note }: { note: NoteRead }) {
  const t = useTranslations();
  const queryClient = useQueryClient();

  // Folder path for the FileBreadcrumb. useFolderPath reads from the ['folders'] cache.
  const folderPath = useFolderPath(note.folderId);

  const title = note.title.trim() || t('notes.untitled');

  const { mutate: restore, isPending: isRestoring } = useMutation({
    mutationFn: () => sdk.trashRestore({ path: { kind: 'note', item_id: note.id } }),
    onSuccess: () => {
      // Refetch the note so the page switches from read-only to editable.
      void queryClient.invalidateQueries({ queryKey: ['notes', note.id] });
      void queryClient.invalidateQueries({ queryKey: ['trash'] });
      toast.success(t('trash.restored'));
    },
    onError: err => toast.error(getErrorDetail(err, t('trash.failed_to_restore'))),
  });

  const { mutate: hardDelete, isPending: isDeleting } = useMutation({
    mutationFn: () => sdk.trashHardDelete({ path: { kind: 'note', item_id: note.id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['trash'] });
      // No need to refetch the note — it no longer exists after hard delete.
      toast.success(t('trash.deleted_forever'));
    },
    onError: err => toast.error(getErrorDetail(err, t('trash.failed_to_delete'))),
  });

  const { width, toggleWidth } = useNoteWidth();
  const { isDesktop } = useBreakpoint();
  const isFullWidth = isDesktop && width === 'full';

  return (
    <FilePageShell
      // No rename and no move for a trashed note.
      breadcrumb={
        <FileBreadcrumb
          path={folderPath}
          current={{ kind: 'note', id: note.id, name: note.title, parentId: note.folderId }}
          renameDisabled
        />
      }
      actions={isDesktop && <NoteWidthToggle isFullWidth={isFullWidth} onToggle={toggleWidth} />}
    >
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className={cn('mx-auto w-full px-4 pb-24 md:px-6', isFullWidth ? 'max-w-none md:px-12' : 'max-w-[720px]')}>
          <p className="note-title w-full text-foreground/60 p-0">{title}</p>

          <div className="mt-4 mb-6">
            <TrashBanner
              onRestore={() => restore()}
              onDelete={() => hardDelete()}
              isRestoring={isRestoring}
              isDeleting={isDeleting}
            />
          </div>

          <RichNoteEditor editable={false} initialContent={note.content ?? ''} />
        </div>
      </div>
    </FilePageShell>
  );
}

function TrashBanner({
  onRestore,
  onDelete,
  isRestoring,
  isDeleting,
}: {
  onRestore: () => void;
  onDelete: () => void;
  isRestoring: boolean;
  isDeleting: boolean;
}) {
  const t = useTranslations('notes');
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-muted px-4 py-2.5 text-sm">
      <Trash2 className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-48 flex-1 text-foreground">{t('in_trash_banner')}</span>
      <div className="ml-auto flex gap-2">
        <Button size="sm" variant="outline" onClick={onRestore} disabled={isRestoring || isDeleting}>
          {t('restore')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={onDelete}
          disabled={isRestoring || isDeleting}
        >
          {t('delete_forever')}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const ASSIST_DIFF_SPLIT_KEY = 'assist-diff-split-ratio';
const CANONICAL_URL_DEBOUNCE_MS = 500;

function NoteForm({ note }: { note: NoteRead }) {
  const t = useTranslations();
  const { isDesktop } = useBreakpoint();
  const { width, toggleWidth } = useNoteWidth();
  // Only desktop has room for a full-width column; smaller screens always fill the page.
  const isFullWidth = isDesktop && width === 'full';

  const editorRef = useRef<RichNoteEditorRef>(null);
  const { title, tags, initialContent, status, setTitle, setTags, setContent, flush, reload, keepMine } = useNoteDraft({
    note,
    editorRef,
  });

  // ── Folder path + move ───────────────────────────────────────────────────────

  const queryClient = useQueryClient();
  const [moveOpen, setMoveOpen] = useState(false);

  // Ancestor chain (root → note's folder) for the FileBreadcrumb.
  const folderPath = useFolderPath(note.folderId);

  // Rename via the draft so autosave owns the version and a 409 cannot occur.
  function handleRename(newName: string) {
    setTitle(newName);
    void flush();
  }

  const { mutate: moveNote, isPending: isMoving } = useMutation({
    mutationFn: (folderId: string | null) => sdk.notesMove({ path: { note_id: note.id }, body: { folderId } }),
    onSuccess: res => {
      // Merge only folderId: the draft owns content and version, so a move must not reset them.
      queryClient.setQueryData<{ data: NoteRead }>(['notes', note.id], old =>
        old && res.data ? { ...old, data: { ...old.data, folderId: res.data.folderId } } : old
      );
      void queryClient.invalidateQueries({ queryKey: ['folders', 'contents'] });
      // refetchType 'none': same as useNoteDraft — do not refetch the open note while the user edits.
      void queryClient.invalidateQueries({ queryKey: ['notes'], refetchType: 'none' });
      toast.success(t('files.note_moved'));
      setMoveOpen(false);
    },
    onError: err => toast.error(getErrorDetail(err, t('files.failed_to_move_note'))),
  });

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
    handleHideDiff: hideChunkDiff,
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

  // Canonical URL: history.replaceState changes only the address bar. A router
  // navigation to a new [id] param value could remount the page and the editor.
  // Debounced: Safari throws after 100 history calls in 10 s (e.g. Backspace held in the title).
  // State `null`: Next syncs `usePathname` only for a state that is not its own (`__NA`).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const canonical = noteHref({ id: note.id, title });
      if (window.location.pathname !== canonical) {
        window.history.replaceState(null, '', canonical + window.location.search);
      }
    }, CANONICAL_URL_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [note.id, title]);

  // Assist diff integration.
  const pendingNoteDiff = useAssistDiffStore(s => s.pendingNoteDiff);
  const clearPendingNoteDiff = useAssistDiffStore(s => s.clearPendingNoteDiff);
  // No URL gate: the diff shows whenever this note has a pending Assistant diff, so
  // "View changes" never has to navigate (a navigation would remount the editor).
  const assistCoversPage = useAssistCoversPage();
  const showAssistDiff = pendingNoteDiff?.noteId === note.id && !assistCoversPage;
  const assistDiff = showAssistDiff ? pendingNoteDiff : null;

  // Accept AI refinement — update editor in place, no remount.
  function acceptRefinement() {
    if (!pendingNoteDiff) return;
    // setMarkdown emits the editor onChange, so the draft and autosave get the new content.
    editorRef.current?.setMarkdown(pendingNoteDiff.newContent);
    clearPendingNoteDiff();
  }

  // AI chunk edit and AI refine are mutually exclusive. Desktop shows the diff in the side pane,
  // mobile in a drawer — the same content in both.
  const diffPanel = chunkDiff ? (
    <DiffPanel
      title={t('notes_ai.changes')}
      onAccept={acceptChunkDiff}
      onReject={rejectChunkDiff}
      onClose={hideChunkDiff}
    >
      <DiffNoteContent oldContent={chunkDiff.originalMarkdown} newContent={chunkDiff.editedText} />
    </DiffPanel>
  ) : assistDiff ? (
    <DiffPanel title={t('notes_ai.changes')} onAccept={acceptRefinement} onReject={clearPendingNoteDiff}>
      <DiffNoteContent oldContent={assistDiff.oldContent} newContent={assistDiff.newContent} />
    </DiffPanel>
  ) : null;

  return (
    <FilePageShell
      breadcrumb={
        <FileBreadcrumb
          path={folderPath}
          current={{ kind: 'note', id: note.id, name: title, parentId: note.folderId }}
          onRename={handleRename}
        />
      }
      actions={
        <>
          <SaveStatus status={status} onRetry={() => void flush()} />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMoveOpen(true)}
            tooltip={t('files.move')}
            aria-label={t('files.move')}
          >
            <FolderInput className="size-[18px]" />
          </Button>
          {isDesktop && <NoteWidthToggle isFullWidth={isFullWidth} onToggle={toggleWidth} />}
        </>
      }
    >
      <MoveDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        currentParentId={note.folderId}
        isPending={isMoving}
        onConfirm={moveNote}
      />

      <SplitPane
        storageKey={ASSIST_DIFF_SPLIT_KEY}
        side={isDesktop ? diffPanel : null}
        main={
          // Centered text column — title, tags and body scroll together.
          <div
            className={cn(
              'mx-auto w-full px-4 pt-20 pb-24 md:px-6',
              isFullWidth ? 'max-w-none md:px-12' : 'max-w-[720px]'
            )}
          >
            <input
              type="text"
              // Same limit as the backend (`NoteBase.title`), so a long title cannot cause a 422.
              maxLength={200}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={t('notes.untitled')}
              className="note-title w-full bg-transparent text-foreground placeholder:text-muted-foreground/50 outline-none border-none focus:ring-0 p-0"
            />
            <div className="mt-2 mb-6">
              <TagInput tags={tags} onChange={setTags} />
            </div>

            {status === 'conflict' && <ConflictBanner onReload={reload} onKeepMine={keepMine} />}

            <RichNoteEditor
              editorRef={editorRef}
              initialContent={initialContent}
              onChange={setContent}
              onBlur={() => void flush()}
              onAskAi={aiAvailable ? handleAskAi : undefined}
              onSendToAssistant={aiAvailable ? handleSendToAssistant : undefined}
            />
          </div>
        }
      />

      {/* Mobile: closing the drawer hides a chunk diff (tap its highlight to reopen) and rejects the assistant diff. */}
      {!isDesktop && (
        <Drawer
          open={!!diffPanel}
          onOpenChange={open => {
            if (open) return;
            if (chunkDiff) hideChunkDiff();
            else clearPendingNoteDiff();
          }}
        >
          <DrawerContent className="max-h-[75dvh]">
            <div className="overflow-y-auto px-4 pb-8">{diffPanel}</div>
          </DrawerContent>
        </Drawer>
      )}

      {/* Instruction popover — anchored below the selection rect */}
      {pendingSelection && (
        <InstructionPopover
          selection={pendingSelection}
          getView={() => editorRef.current?.editor?.view ?? null}
          isPending={isChunkPending}
          onSubmit={submitInstructions}
          onCancel={cancelInstructions}
          onClosed={() => editorRef.current?.editor?.commands.focus()}
        />
      )}
    </FilePageShell>
  );
}

// ─── sub-components ───────────────────────────────────────────────────────────

function NoteWidthToggle({ isFullWidth, onToggle }: { isFullWidth: boolean; onToggle: () => void }) {
  const t = useTranslations('notes');
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onToggle}
      // Fixed label: `aria-pressed` already tells the state. A label that changes too
      // makes a screen reader say the state two times.
      aria-pressed={!isFullWidth}
      aria-label={t('width_reading')}
      tooltip={t(isFullWidth ? 'width_reading' : 'width_full')}
      className={cn(!isFullWidth && 'text-primary')}
    >
      <BookOpen className="size-[18px]" />
    </Button>
  );
}

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
      {/* No Retry button: the same payload gets the same 422. The next edit saves again. */}
      {status === 'invalid' && (
        <>
          <AlertCircle className="size-3 text-destructive" />
          <span className="text-destructive">{t('note_too_long')}</span>
        </>
      )}
    </div>
  );
}

// ─── InstructionPopover ───────────────────────────────────────────────────────

/** What Radix positions against. `contextElement` tells it which scroll containers to watch. */
type SelectionAnchor = { getBoundingClientRect: () => DOMRect; contextElement?: Element };

/**
 * A virtual anchor on the selected text. The rect is read again on every scroll, so the
 * popover follows the selection when the editor column scrolls.
 */
function createSelectionAnchor(getView: () => EditorView | null, selection: SelectionContext): SelectionAnchor {
  return {
    getBoundingClientRect: () => {
      const view = getView();
      if (!view) return selection.rect;
      try {
        return posToDOMRect(view, selection.from, selection.to);
      } catch {
        // The positions are no longer in the document. Keep the last known place.
        return selection.rect;
      }
    },
    get contextElement() {
      return getView()?.dom;
    },
  };
}

type InstructionPopoverProps = {
  selection: SelectionContext;
  /** Read only after mount (by Radix), never during render. */
  getView: () => EditorView | null;
  isPending: boolean;
  onSubmit: (instructions: string) => void;
  onCancel: () => void;
  /** Focus goes back to the editor when the popover closes (there is no trigger button). */
  onClosed: () => void;
};

function InstructionPopover({ selection, getView, isPending, onSubmit, onCancel, onClosed }: InstructionPopoverProps) {
  const t = useTranslations('notes_ai');
  const [instructions, setInstructions] = useState('');
  const [virtualRef] = useState(() => ({ current: createSelectionAnchor(getView, selection) }));
  // An outside click already put the focus where the user clicked (e.g. the title).
  // A refocus of the editor would then send the typed keys into the body.
  const closedByOutside = useRef(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && instructions.trim()) onSubmit(instructions.trim());
  };

  // Radix handles Esc, outside click, collisions and focus.
  return (
    <FloatingCard open onOpenChange={open => !open && onCancel()}>
      <FloatingCardAnchor virtualRef={virtualRef} />
      <FloatingCardContent
        sideOffset={6}
        collisionPadding={8}
        hideWhenDetached
        // Not while the request runs: the result would then arrive with no visible sign that it was loading.
        onInteractOutside={e => {
          if (isPending) e.preventDefault();
          else closedByOutside.current = true;
        }}
        onEscapeKeyDown={e => isPending && e.preventDefault()}
        onCloseAutoFocus={e => {
          e.preventDefault();
          if (!closedByOutside.current) onClosed();
        }}
        className="z-60 flex items-center gap-1.5 p-1.5"
      >
        <input
          type="text"
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('instructions_placeholder')}
          className="h-7 w-[min(16rem,calc(100vw-8rem))] rounded border border-border bg-background px-2 text-xs outline-none focus:border-primary"
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
      </FloatingCardContent>
    </FloatingCard>
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
    // flex-wrap: on a phone the buttons go to a second row instead of squeezing the text.
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-muted px-4 py-2.5 text-sm">
      <AlertCircle className="size-4 shrink-0 text-destructive" />
      <span className="min-w-48 flex-1 text-foreground">{t('conflict_banner')}</span>
      <div className="ml-auto flex gap-2">
        <Button size="sm" variant="outline" onClick={() => void onReload()} icon={RefreshCw}>
          {t('reload')}
        </Button>
        <Button size="sm" variant="ghost" onClick={handleKeepMine} disabled={isKeeping}>
          {t('keep_mine')}
        </Button>
      </div>
    </div>
  );
}

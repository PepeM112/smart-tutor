'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';

import { type NoteRead } from '@/client';
import { ResponsiveSplitPane } from '@/components/shared/ResponsiveSplitPane';
import { DiffNoteContent, DiffPanel } from '@/features/assist/components/diff';
import { useAssistCoversPage } from '@/features/assist/hooks/useAssistCoversPage';
import { useAssistAttachmentsStore } from '@/features/assist/store/useAssistAttachmentsStore';
import { useAssistDiffStore } from '@/features/assist/store/useAssistDiffStore';
import { useAssistPanelStore } from '@/features/assist/store/useAssistPanelStore';
import { CourseNoteBreadcrumb } from '@/features/courses/components/CourseNoteBreadcrumb';
import { useCourse } from '@/features/courses/hooks/useCourse';
import { spaceHref } from '@/features/courses/lib/spaceHref';
import { FileBreadcrumb } from '@/features/files/components/FileBreadcrumb';
import { MoveDialog } from '@/features/files/components/MoveDialog';
import { useFileMutations } from '@/features/files/hooks/useFileMutations';
import { useFolderPath } from '@/features/files/hooks/useFolderPath';
import { folderPathHref } from '@/features/files/lib/folderPathHref';
import { useAiAvailable } from '@/hooks/useAiAvailable';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { usePageActions, usePageLead } from '@/hooks/usePageActions';
import { displayTitle } from '@/lib/displayTitle';
import { Routes } from '@/lib/routes';

import { type RichNoteEditorRef } from '../editor/RichNoteEditor';
import { useChunkAiEdit } from '../editor/useChunkAiEdit';
import { useCanonicalNoteUrl } from '../hooks/useCanonicalNoteUrl';
import { useNoteColumn } from '../hooks/useNoteColumn';
import { useNoteDraft } from '../hooks/useNoteDraft';

import { InstructionPopover } from './InstructionPopover';
import { NoteEditorBody } from './NoteEditorBody';
import { NoteHeaderActions } from './NoteHeaderActions';

import type { SelectionContext } from '../editor/NoteBubbleMenu';

const ASSIST_DIFF_SPLIT_KEY = 'assist-diff-split-ratio';

/** The editable note page: autosaved draft, AI chunk edit, Assistant diff, move. */
export function NoteForm({ note }: { note: NoteRead }) {
  const t = useTranslations();
  const { isDesktop, isFullWidth, toggleWidth } = useNoteColumn();

  const editorRef = useRef<RichNoteEditorRef>(null);
  const { title, tags, initialContent, status, setTitle, setTags, setContent, flush, reload, keepMine } = useNoteDraft({
    note,
    editorRef,
  });

  // ── Folder path + move ───────────────────────────────────────────────────────

  const [moveOpen, setMoveOpen] = useState(false);

  // Ancestor chain (root → note's folder) for the FileBreadcrumb.
  const folderPath = useFolderPath(note.folderId);

  // Rename via the draft so autosave owns the version and a 409 cannot occur.
  function handleRename(newName: string) {
    setTitle(newName);
    void flush();
  }

  // The shared moveNote merges only folderId into the note cache, so the open editor is not reset.
  const { moveNote, isMovingNote } = useFileMutations();

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

  useCanonicalNoteUrl(note.id, title);

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
    const editor = editorRef.current;
    // Keep the diff while the editor is not mounted: clearing it now would drop the change unseen.
    if (!pendingNoteDiff || !editor) return;
    // setMarkdown emits the editor onChange, so the draft and autosave get the new content.
    editor.setMarkdown(pendingNoteDiff.newContent);
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

  // Mobile: closing the drawer hides a chunk diff (tap its highlight to reopen) and rejects the assistant diff.
  function handleDiffClose() {
    if (chunkDiff) hideChunkDiff();
    else clearPendingNoteDiff();
  }

  // A draft course note: the title is edited in the body, and folders and favorites do not apply.
  const courseId = note.spaceId ?? null;

  // The phone header has the title and a Back; the desktop header has the path (`lead`) with the rename control.
  const { data: course } = useCourse(courseId ?? '', courseId !== null);
  useBreadcrumb(
    displayTitle(title, t),
    undefined,
    courseId ? (course ? spaceHref(course) : Routes.COURSES) : folderPathHref(folderPath)
  );

  // Not memoized: the draft handlers (rename, retry) close over the latest draft state and autosave version.
  usePageLead(
    courseId ? (
      <CourseNoteBreadcrumb courseId={courseId} noteTitle={title} />
    ) : (
      <FileBreadcrumb
        path={folderPath}
        current={{ kind: 'note', id: note.id, name: title, parentId: note.folderId }}
        onRename={handleRename}
      />
    ),
    // The file breadcrumb ends with the note title as the h1. The course note lead has no heading.
    courseId === null
  );
  usePageActions(
    <NoteHeaderActions
      noteId={note.id}
      isFavorite={note.isFavorite}
      status={status}
      onRetry={() => void flush()}
      onMove={() => setMoveOpen(true)}
      showFileActions={courseId === null}
      showWidthToggle={isDesktop}
      isFullWidth={isFullWidth}
      onToggleWidth={toggleWidth}
    />
  );

  return (
    <div className="flex h-full flex-col">
      <MoveDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        currentParentId={note.folderId}
        isPending={isMovingNote}
        onConfirm={folderId => moveNote({ id: note.id, folderId }, { onSuccess: () => setMoveOpen(false) })}
      />

      <ResponsiveSplitPane
        storageKey={ASSIST_DIFF_SPLIT_KEY}
        // The note scrolls at the page edge (the layout padding moves inside the pane).
        bleed
        side={diffPanel}
        onSideClose={handleDiffClose}
        main={
          <NoteEditorBody
            noteId={note.id}
            title={title}
            onTitleChange={setTitle}
            tags={tags}
            onTagsChange={setTags}
            status={status}
            onReload={reload}
            onKeepMine={keepMine}
            editorRef={editorRef}
            initialContent={initialContent}
            onContentChange={setContent}
            onBlur={() => void flush()}
            onAskAi={aiAvailable ? handleAskAi : undefined}
            onSendToAssistant={aiAvailable ? handleSendToAssistant : undefined}
            isFullWidth={isFullWidth}
          />
        }
      />

      {/* Instruction popover — anchored below the selection rect */}
      {pendingSelection && (
        <InstructionPopover
          // The anchor is created once per mount: a new selection needs a new popover.
          key={`${pendingSelection.from}:${pendingSelection.to}`}
          selection={pendingSelection}
          getView={() => editorRef.current?.editor?.view ?? null}
          isPending={isChunkPending}
          onSubmit={submitInstructions}
          onCancel={cancelInstructions}
          onClosed={() => editorRef.current?.editor?.commands.focus()}
        />
      )}
    </div>
  );
}

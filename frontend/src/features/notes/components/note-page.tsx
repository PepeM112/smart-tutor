'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, Save, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { type NoteRead } from '@/client';
import { AutoTextarea } from '@/components/shared/auto-textarea';
import { QueryState } from '@/components/shared/query-state';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { DiffNoteContent, DiffPanel } from '@/features/assist/components/diff';
import { useProvidePageData } from '@/features/assist/hooks/use-provide-page-data';
import { useAssistDiffStore } from '@/features/assist/store/use-assist-diff-store';
import { formatNoteDetail } from '@/features/assist/utils/format-page-data';
import { GenerateTestDialog } from '@/features/tests/components/generate-test-dialog';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useMobileBreadcrumbActions } from '@/hooks/use-mobile-breadcrumb-actions';
import { useResizableSplit } from '@/hooks/use-resizable-split';
import { sdk } from '@/lib/api-client';

import { NoteEditor } from './note-editor';
import { RefineNoteDialog } from './refine-note-dialog';
import { TagInput } from './tag-input';

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
  });

  const noteData = note?.data;
  useProvidePageData(useMemo(() => (noteData ? formatNoteDetail(noteData) : null), [noteData]));

  return (
    <QueryState isLoading={isLoading} isError={isError} errorMessage={t('notes.failed_to_load_note')}>
      {note?.data ? (
        <NoteForm key={`${note.data.id}-${String(note.data.updatedAt)}`} note={note.data} />
      ) : (
        <p className="text-muted-foreground">{t('notes.note_not_found')}</p>
      )}
    </QueryState>
  );
}

const ASSIST_DIFF_SPLIT_KEY = 'assist-diff-split-ratio';

function NoteForm({ note }: { note: NoteRead }) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { isDesktop } = useBreakpoint();
  const searchParams = useSearchParams();
  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [description, setDescription] = useState(note.description ?? '');
  const [content, setContent] = useState(note.content ?? '');
  const [tags, setTags] = useState<string[]>(note.tags ?? []);
  const [isDirty, setIsDirty] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const headerSnapshot = useRef({ title: '', description: '', tags: [] as string[] });

  const pendingNoteDiff = useAssistDiffStore(s => s.pendingNoteDiff);
  const clearPendingNoteDiff = useAssistDiffStore(s => s.clearPendingNoteDiff);
  const showAssistDiff = searchParams.get('diff') === 'assist' && pendingNoteDiff?.noteId === note.id;

  const {
    containerRef: assistDiffContainerRef,
    splitRatio: assistDiffRatio,
    handleDividerMouseDown: assistDiffDividerDown,
    resetRatio: assistDiffResetRatio,
  } = useResizableSplit(ASSIST_DIFF_SPLIT_KEY, 0.5);

  function acceptRefinement() {
    if (!pendingNoteDiff) return;
    setContent(pendingNoteDiff.newContent);
    setEditorKey(k => k + 1);
    setIsDirty(true);
    clearPendingNoteDiff();
  }

  function startEditingHeader() {
    headerSnapshot.current = { title, description, tags: [...tags] };
    setIsEditingHeader(true);
  }

  function confirmHeader() {
    setIsEditingHeader(false);
  }

  function cancelHeader() {
    setTitle(headerSnapshot.current.title);
    setDescription(headerSnapshot.current.description);
    setTags(headerSnapshot.current.tags);
    setIsEditingHeader(false);
  }

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const { mutate: save, isPending: isSaving } = useMutation({
    mutationFn: () =>
      sdk.notesUpdate({
        path: { note_id: note.id },
        body: { title, description: description || null, content, tags },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notes'] });
      toast.success(t('notes.note_saved'));
      setIsDirty(false);
    },
    onError: () => toast.error(t('notes.failed_to_save')),
  });

  function markDirty() {
    setIsDirty(true);
  }

  useMobileBreadcrumbActions(
    isDirty ? (
      <Button icon={Save} onClick={() => save()} disabled={isSaving || !title.trim()}>
        {isSaving ? t('notes.saving') : t('common.save')}
      </Button>
    ) : undefined
  );

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      <div className="space-y-3 pb-4">
        {/* Header: title/description/tags */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3 flex-1 min-w-0">
            {isEditingHeader ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={title}
                    onChange={e => {
                      setTitle(e.target.value);
                      markDirty();
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') confirmHeader();
                      if (e.key === 'Escape') cancelHeader();
                    }}
                    className="w-80 max-w-full text-sm lg:text-lg lg:font-semibold"
                    placeholder={t('notes.note_title')}
                    autoFocus
                  />
                  <Button variant="secondary" size="icon" onClick={confirmHeader}>
                    <Check className="size-4" />
                  </Button>
                  <Button variant="secondary" size="icon" onClick={cancelHeader} className="text-muted-foreground">
                    <X className="size-4" />
                  </Button>
                </div>
                <AutoTextarea
                  rows={2}
                  value={description}
                  onChange={e => {
                    setDescription(e.target.value);
                    markDirty();
                  }}
                  placeholder={t('notes.description_optional')}
                />
                <TagInput
                  tags={tags}
                  onChange={next => {
                    setTags(next);
                    markDirty();
                  }}
                />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold text-foreground">{title || t('notes.untitled')}</h1>
                <Button variant="ghost" size="icon-sm" onClick={startEditingHeader} className="text-muted-foreground">
                  <Pencil className="size-3.5" />
                </Button>
              </div>
            )}
            {!isEditingHeader && (
              <>
                {description && <p className="text-sm text-muted-foreground">{description}</p>}
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map(tag => (
                      <span
                        key={tag}
                        className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Actions: desktop inline, mobile right-aligned below */}
          <div className="flex items-center gap-2 self-end lg:self-auto">
            {isDesktop && isDirty && (
              <Button icon={Save} onClick={() => save()} disabled={isSaving || !title.trim()}>
                {isSaving ? t('notes.saving') : t('common.save')}
              </Button>
            )}
            <RefineNoteDialog
              noteId={note.id}
              onRefined={newContent => {
                setContent(newContent);
                setEditorKey(k => k + 1);
                markDirty();
              }}
            />
            <GenerateTestDialog noteId={note.id} noteTitle={note.title} />
          </div>
        </div>
      </div>

      <div ref={assistDiffContainerRef} className="flex flex-1 min-h-0 overflow-hidden gap-0">
        <div
          className="min-w-0 flex-1 overflow-hidden"
          style={{ flex: isDesktop && showAssistDiff ? assistDiffRatio : 1 }}
        >
          <NoteEditor
            key={editorKey}
            content={content}
            onChange={v => {
              setContent(v);
              markDirty();
            }}
            noteId={note.id}
          />
        </div>

        {/* Desktop: AI refine diff side panel */}
        {isDesktop && showAssistDiff && pendingNoteDiff && (
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
              <DiffPanel
                title={t('notes_ai.changes')}
                onAccept={() => acceptRefinement()}
                onReject={clearPendingNoteDiff}
              >
                <DiffNoteContent oldContent={pendingNoteDiff.oldContent} newContent={pendingNoteDiff.newContent} />
              </DiffPanel>
            </div>
          </>
        )}

        {/* Mobile: AI refine diff as bottom drawer */}
        {!isDesktop && (
          <Drawer open={showAssistDiff && !!pendingNoteDiff} onOpenChange={open => !open && clearPendingNoteDiff()}>
            <DrawerContent className="max-h-[75dvh]" title={t('notes_ai.changes')}>
              {pendingNoteDiff && (
                <div className="overflow-y-auto px-4 pb-8">
                  <DiffPanel
                    title={t('notes_ai.changes')}
                    onAccept={() => acceptRefinement()}
                    onReject={clearPendingNoteDiff}
                  >
                    <DiffNoteContent oldContent={pendingNoteDiff.oldContent} newContent={pendingNoteDiff.newContent} />
                  </DiffPanel>
                </div>
              )}
            </DrawerContent>
          </Drawer>
        )}
      </div>
    </div>
  );
}

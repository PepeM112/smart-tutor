'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, Save, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { type NoteRead } from '@/client';
import { AutoTextarea } from '@/components/shared/auto-textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GenerateTestDialog } from '@/features/tests/components/generate-test-dialog';
import { sdk } from '@/lib/api-client';

import { NoteEditor } from './note-editor';
import { RefineNoteDialog } from './refine-note-dialog';
import { TagInput } from './tag-input';

type Props = {
  noteId: string;
};

export function NotePage({ noteId }: Props) {
  const {
    data: note,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['notes', noteId],
    queryFn: () => sdk.notesGet({ path: { note_id: noteId } }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  if (isError) {
    return <p className="text-muted-foreground">Failed to load note. Please try again.</p>;
  }

  if (!note?.data) {
    return <p className="text-muted-foreground">Note not found.</p>;
  }

  return <NoteForm key={note.data.id} note={note.data} />;
}

function NoteForm({ note }: { note: NoteRead }) {
  const queryClient = useQueryClient();
  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [description, setDescription] = useState(note.description ?? '');
  const [content, setContent] = useState(note.content ?? '');
  const [tags, setTags] = useState<string[]>(note.tags ?? []);
  const [isDirty, setIsDirty] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const headerSnapshot = useRef({ title: '', description: '', tags: [] as string[] });

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
      toast.success('Note saved');
      setIsDirty(false);
    },
    onError: () => toast.error('Failed to save note'),
  });

  function markDirty() {
    setIsDirty(true);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      <div className="space-y-3 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3 flex-1">
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
                    className="w-80 text-lg font-semibold"
                    placeholder="Note title"
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
                  placeholder="Description (optional)"
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
                <h1 className="text-lg font-semibold text-foreground">{title || 'Untitled'}</h1>
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
          <div className="flex items-center gap-2">
            {isDirty && (
              <Button icon={Save} onClick={() => save()} disabled={isSaving || !title.trim()}>
                {isSaving ? 'Saving...' : 'Save'}
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

      <div className="flex-1 min-h-0 overflow-hidden">
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
    </div>
  );
}

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Pencil, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { type NoteRead } from '@/client';
import { AutoTextarea } from '@/components/shared/auto-textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GenerateTestDialog } from '@/features/tests/components/generate-test-dialog';
import { sdk } from '@/lib/api-client';
import { cn } from '@/lib/utils';

import { MarkdownRenderer } from './markdown-renderer';
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
  const [isEditing, setIsEditing] = useState(true);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [description, setDescription] = useState(note.description ?? '');
  const [content, setContent] = useState(note.content ?? '');
  const [tags, setTags] = useState<string[]>(note.tags ?? []);
  const [isDirty, setIsDirty] = useState(false);

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
            <div className="flex items-center gap-2">
              {isEditingTitle ? (
                <Input
                  value={title}
                  onChange={e => {
                    setTitle(e.target.value);
                    markDirty();
                  }}
                  onBlur={() => setIsEditingTitle(false)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') setIsEditingTitle(false);
                  }}
                  className="w-80 text-lg font-semibold"
                  placeholder="Note title"
                  autoFocus
                />
              ) : (
                <>
                  <h1 className="text-lg font-semibold text-foreground">{title || 'Untitled'}</h1>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setIsEditingTitle(true)}
                    className="text-muted-foreground"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                </>
              )}
            </div>
            {isEditing && (
              <>
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
              </>
            )}
            {!isEditing && (
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
            {isEditing && isDirty && (
              <Button icon={Save} onClick={() => save()} disabled={isSaving || !title.trim()}>
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            )}
            <RefineNoteDialog
              noteId={note.id}
              onRefined={newContent => {
                setContent(newContent);
              }}
            />
            <GenerateTestDialog noteId={note.id} noteTitle={note.title} />
            <Button variant="outline" icon={isEditing ? Eye : Pencil} onClick={() => setIsEditing(!isEditing)}>
              {isEditing ? 'View' : 'Edit'}
            </Button>
          </div>
        </div>
        <hr className="border-border" />
      </div>

      <div className={cn('flex-1 min-h-0 overflow-hidden', !isEditing && 'rounded-lg border border-border bg-card')}>
        {isEditing ? (
          <NoteEditor
            content={content}
            onChange={v => {
              setContent(v);
              markDirty();
            }}
            noteId={note.id}
          />
        ) : (
          <div className="h-full overflow-y-auto p-6">
            {content ? (
              <MarkdownRenderer content={content} />
            ) : (
              <p className="text-sm text-muted-foreground/50 italic">
                This note is empty. Click Edit to start writing.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

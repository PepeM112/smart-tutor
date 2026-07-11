'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { AutoTextarea } from '@/components/shared/auto-textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';

import { NoteEditor } from './note-editor';
import { TagInput } from './tag-input';

export function NewNotePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  const { mutate: createNote, isPending: isCreating } = useMutation({
    mutationFn: () =>
      sdk.notesCreate({
        body: { title, description: description || undefined, content, tags },
      }),
    onSuccess: res => {
      void queryClient.invalidateQueries({ queryKey: ['notes'] });
      toast.success('Note created');
      router.push(Routes.NOTE_DETAIL(res.data!.id));
    },
    onError: () => toast.error('Failed to create note'),
  });

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 pb-4">
        <div className="space-y-3">
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-80 text-lg font-semibold"
            placeholder="Note title"
            autoFocus
          />
          <AutoTextarea
            rows={2}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Description (optional)"
          />
          <TagInput tags={tags} onChange={setTags} />
        </div>
        <Button icon={Save} onClick={() => createNote()} disabled={!title.trim() || isCreating}>
          {isCreating ? 'Creating...' : 'Create'}
        </Button>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <NoteEditor content={content} onChange={setContent} />
      </div>
    </div>
  );
}

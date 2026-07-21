'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { AutoTextarea } from '@/components/shared/auto-textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';
import { useBreadcrumbStore } from '@/store/use-breadcrumb-store';

import { NoteEditor } from './note-editor';
import { TagInput } from './tag-input';

export function NewNotePage() {
  const t = useTranslations('notes');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isDesktop } = useBreakpoint();
  const setActions = useBreadcrumbStore(s => s.setActions);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [isEditingHeader, setIsEditingHeader] = useState(true);

  const isDirty = !!(title || description || content || tags.length > 0);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const { mutate: createNote, isPending: isCreating } = useMutation({
    mutationFn: () =>
      sdk.notesCreate({
        body: { title, description: description || undefined, content, tags },
      }),
    onSuccess: res => {
      void queryClient.invalidateQueries({ queryKey: ['notes'] });
      toast.success(t('note_created'));
      if (!res.data) return;
      router.push(Routes.NOTE_DETAIL(res.data.id));
    },
    onError: () => toast.error(t('failed_to_create')),
  });

  useEffect(() => {
    if (!isDesktop) {
      setActions(
        <Button icon={Save} onClick={() => createNote()} disabled={!title.trim() || isCreating}>
          {isCreating ? t('creating') : t('create')}
        </Button>
      );
      return () => setActions(undefined);
    }
    setActions(undefined);
  }, [isDesktop, title, isCreating, createNote, setActions, t]);

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4">
        <div className="space-y-3 flex-1 min-w-0">
          {isEditingHeader ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-80 max-w-full text-sm"
                  placeholder={t('note_title')}
                  autoFocus
                />
                {!isDesktop && (
                  <Button variant="secondary" size="icon" onClick={() => setIsEditingHeader(false)}>
                    <Check className="size-4" />
                  </Button>
                )}
              </div>
              <AutoTextarea
                rows={2}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={t('description_optional')}
              />
              <TagInput tags={tags} onChange={setTags} />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground truncate">{title || t('note_title')}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setIsEditingHeader(true)}
                className="text-muted-foreground"
              >
                <Pencil className="size-3.5" />
              </Button>
            </div>
          )}
        </div>
        {isDesktop && (
          <Button icon={Save} onClick={() => createNote()} disabled={!title.trim() || isCreating}>
            {isCreating ? t('creating') : t('create')}
          </Button>
        )}
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <NoteEditor content={content} onChange={setContent} />
      </div>
    </div>
  );
}

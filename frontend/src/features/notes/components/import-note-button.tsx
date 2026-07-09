'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';

export function ImportNoteButton() {
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const queryClient = useQueryClient();

  const { mutate: createNote } = useMutation({
    mutationFn: (vars: { title: string; content: string }) =>
      sdk.notesCreate({ body: { title: vars.title, content: vars.content } }),
    onSuccess: res => {
      void queryClient.invalidateQueries({ queryKey: ['notes'] });
      toast.success('Note imported');
      router.push(Routes.NOTE_DETAIL(res.data!.id));
    },
    onError: () => toast.error('Failed to import note'),
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      const title = file.name.replace(/\.md$/i, '');
      createNote({ title, content });
    };
    reader.readAsText(file);

    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <>
      <input ref={fileRef} type="file" accept=".md,.markdown" className="hidden" onChange={handleFileChange} />
      <Button variant="outline" size="lg" icon={Upload} onClick={() => fileRef.current?.click()}>
        Import
      </Button>
    </>
  );
}

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { sdk } from '@/lib/apiClient';
import { NAME_LIMITS } from '@/lib/limits';
import { getErrorDetail } from '@/lib/utils';

import { invalidateAfterFileChange } from '../lib/queryKeys';

// ─── Create ──────────────────────────────────────────────────────────────────

type CreateProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current folder's ID; undefined or null = root */
  parentId?: string | null;
};

export function NewFolderDialog({ open, onOpenChange, parentId }: CreateProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <NewFolderForm key="new-folder-form" parentId={parentId} onClose={() => onOpenChange(false)} />}
    </Dialog>
  );
}

type NewFolderFormProps = {
  parentId?: string | null;
  onClose: () => void;
};

function NewFolderForm({ parentId, onClose }: NewFolderFormProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');

  const { mutate: create, isPending } = useMutation({
    mutationFn: () => sdk.foldersCreate({ body: { name: name.trim(), parentId: parentId ?? null } }),
    onSuccess: () => {
      invalidateAfterFileChange(queryClient);
      toast.success(t('files.folder_created'));
      onClose();
    },
    onError: err => toast.error(getErrorDetail(err, t('files.failed_to_create_folder'))),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim()) create();
  }

  return (
    <DialogContent>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>{t('files.new_folder')}</DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-2">
          <Label htmlFor="folder-name">{t('files.folder_name')}</Label>
          <Input
            id="folder-name"
            placeholder={t('files.folder_name_placeholder')}
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={NAME_LIMITS.folder}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button type="submit" size="lg" disabled={!name.trim() || isPending}>
            {t('files.create_folder')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

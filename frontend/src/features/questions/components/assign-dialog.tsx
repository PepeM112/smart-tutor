'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { sdk } from '@/lib/api-client';

type Props = {
  questionIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export function AssignDialog({ questionIds, open, onOpenChange, onSuccess }: Props) {
  const t = useTranslations('questions');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();
  const [selectedTestId, setSelectedTestId] = useState('');
  const isBulk = questionIds.length > 1;

  const { data: testsResponse } = useQuery({
    queryKey: ['tests'],
    queryFn: () => sdk.testsList(),
    enabled: open,
  });

  const tests = testsResponse?.data?.items ?? [];

  const { mutate: assignSingle, isPending: isSinglePending } = useMutation({
    mutationFn: () =>
      sdk.questionsAssignToTest({
        path: { question_id: questionIds[0] },
        body: { testId: selectedTestId },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['questions'] });
      toast.success(t('question_assigned'));
      onOpenChange(false);
      setSelectedTestId('');
      onSuccess?.();
    },
    onError: () => toast.error(t('failed_to_assign')),
  });

  const { mutate: assignBulk, isPending: isBulkPending } = useMutation({
    mutationFn: () =>
      sdk.questionsBulkAssign({
        body: { questionIds, testId: selectedTestId },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['questions'] });
      toast.success(t('bulk_assigned'));
      onOpenChange(false);
      setSelectedTestId('');
      onSuccess?.();
    },
    onError: () => toast.error(t('failed_to_assign')),
  });

  const isPending = isSinglePending || isBulkPending;

  function handleAssign() {
    if (isBulk) assignBulk();
    else assignSingle();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('assign_question')}</DialogTitle>
          <DialogDescription>
            {isBulk ? t('assign_description_bulk', { count: questionIds.length }) : t('assign_description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-4">
          <Label>{t('filter_test')}</Label>
          <select
            value={selectedTestId}
            onChange={e => setSelectedTestId(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">{tCommon('select')}</option>
            {tests.map(test => (
              <option key={test.id} value={test.id}>
                {test.title}
              </option>
            ))}
          </select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon('cancel')}
          </Button>
          <Button onClick={handleAssign} disabled={!selectedTestId || isPending}>
            {t('assign_to_test')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

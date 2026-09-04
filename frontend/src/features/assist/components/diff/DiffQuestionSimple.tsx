import { useTranslations } from 'next-intl';

import type { SimpleContent } from '@/client';

import type { DiffQuestionProps } from './types';

export function DiffQuestionSimple({ old: oldQ, new: newQ }: DiffQuestionProps) {
  const t = useTranslations('test_editor');
  // SAFETY: caller only renders this component for SIMPLE-type question diffs
  const oldContent = oldQ.content as SimpleContent;
  const newContent = newQ.content as SimpleContent;

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-feedback-wrong-border bg-feedback-wrong-bg p-3 space-y-1">
        <p className="text-sm text-foreground font-medium">{oldQ.prompt}</p>
        <p className="text-xs text-foreground/80">{t('diff_answers', { answers: oldContent.answers.join(', ') })}</p>
      </div>

      <div className="rounded-lg border border-feedback-correct-border bg-feedback-correct-bg p-3 space-y-1">
        <p className="text-sm text-foreground font-medium">{newQ.prompt}</p>
        <p className="text-xs text-foreground/80">{t('diff_answers', { answers: newContent.answers.join(', ') })}</p>
      </div>
    </div>
  );
}

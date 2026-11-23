import { useTranslations } from 'next-intl';

import { RichText } from '@/components/shared/RichText';
import { isSimpleContent } from '@/features/tests/utils/questionContent';

import type { DiffQuestionProps } from './types';

export function DiffQuestionSimple({ old: oldQ, new: newQ }: DiffQuestionProps) {
  const t = useTranslations('test_editor');
  if (!isSimpleContent(oldQ.content) || !isSimpleContent(newQ.content)) return null;
  const oldContent = oldQ.content;
  const newContent = newQ.content;

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-feedback-wrong-border bg-feedback-wrong-bg p-3 space-y-1">
        <RichText text={oldQ.prompt} className="text-sm text-foreground font-medium" />
        <p className="text-xs text-foreground/80">{t('diff_answers', { answers: oldContent.answers.join(', ') })}</p>
      </div>

      <div className="rounded-lg border border-feedback-correct-border bg-feedback-correct-bg p-3 space-y-1">
        <RichText text={newQ.prompt} className="text-sm text-foreground font-medium" />
        <p className="text-xs text-foreground/80">{t('diff_answers', { answers: newContent.answers.join(', ') })}</p>
      </div>
    </div>
  );
}

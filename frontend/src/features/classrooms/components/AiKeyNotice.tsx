'use client';

import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { type SpaceRole } from '@/client';
import { isCourseViewer } from '@/features/courses/lib/progress';

import { useAiKeyStatus } from '../hooks/useClassrooms';
import { KEY_NOTICE_TEXT, keyNoticeKind } from '../lib/keyNotice';

type Props = {
  /** The classroom id (for a course of a classroom: its `parentId`). */
  classroomId: string;
  myRole: SpaceRole | null;
};

/** Students only: which AI key pays in this classroom, as one small inline line. Teachers see nothing. */
export function AiKeyNotice({ classroomId, myRole }: Props) {
  const t = useTranslations();
  const isStudent = isCourseViewer({ myRole });
  const { data: status } = useAiKeyStatus(classroomId, isStudent);
  const kind = keyNoticeKind(status, isStudent);
  if (!kind) return null;

  return (
    <p
      className="flex items-start gap-2 rounded-lg border border-feedback-partial-border bg-feedback-partial-bg px-3 py-2 text-xs text-foreground"
      role="status"
      data-testid="ai-key-notice"
    >
      <Sparkles className="mt-0.5 size-3.5 shrink-0 text-feedback-partial" aria-hidden />
      {t(KEY_NOTICE_TEXT[kind])}
    </p>
  );
}

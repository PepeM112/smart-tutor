'use client';

import { KeyRound } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { Routes } from '@/lib/routes';

import { useJoinByCode } from '../hooks/useJoinByCode';

/**
 * `/courses/join/[code]`: the join link. The user confirms with a click, so opening a link
 * (a preview in a chat app, for example) never adds a membership.
 */
export function JoinByCodePage({ code }: { code: string }) {
  const t = useTranslations();
  const { mutate: joinByCode, isPending: isJoining } = useJoinByCode();
  useBreadcrumb(t('courses.join_with_code'), [{ label: t('courses.title'), href: Routes.COURSES }], Routes.COURSES);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-border bg-card p-8 text-center shadow-card">
      <KeyRound className="size-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{t('courses.join_link_hint')}</p>
      <code className="rounded-md bg-muted px-3 py-1.5 font-mono text-sm text-foreground">{code}</code>
      <Button size="lg" loading={isJoining} onClick={() => joinByCode(code)}>
        {t('courses.join')}
      </Button>
    </div>
  );
}

'use client';

import { Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Routes } from '@/lib/routes';

export function QuickTestDialog({ compact = false }: { compact?: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const [testId, setTestId] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleGo = () => {
    const id = testId.trim();
    if (!id) return;
    router.push(Routes.TEST_DETAIL(id));
  };

  return (
    <ConfirmDialog
      trigger={
        <Button
          size={compact ? 'icon-lg' : 'lg'}
          variant="outline"
          icon={Zap}
          tooltip={compact ? t('tests.quick_test') : undefined}
        >
          {!compact && t('tests.quick_test')}
        </Button>
      }
      title={t('tests.quick_test')}
      description={t('tests.quick_test_description')}
      confirmLabel={t('common.go')}
      disableConfirm={!testId.trim()}
      onConfirm={handleGo}
      onOpenChange={open => {
        if (open) {
          setTestId('');
          // Wait for the dialog's open animation before focusing
          setTimeout(() => inputRef.current?.focus(), 50);
        }
      }}
    >
      <Input
        ref={inputRef}
        placeholder={t('tests.test_id')}
        value={testId}
        onChange={e => setTestId(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') handleGo();
        }}
      />
    </ConfirmDialog>
  );
}

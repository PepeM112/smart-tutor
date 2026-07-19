'use client';

import { Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Routes } from '@/lib/routes';

export function QuickTestDialog() {
  const t = useTranslations('tests');
  const tCommon = useTranslations('common');
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
        <Button size="lg" variant="outline" icon={Zap}>
          {t('quick_test')}
        </Button>
      }
      title={t('quick_test')}
      description={t('quick_test_description')}
      confirmLabel={tCommon('go')}
      disableConfirm={!testId.trim()}
      onConfirm={handleGo}
      onOpenChange={open => {
        if (open) {
          setTestId('');
          setTimeout(() => inputRef.current?.focus(), 50);
        }
      }}
    >
      <Input
        ref={inputRef}
        placeholder={t('test_id')}
        value={testId}
        onChange={e => setTestId(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') handleGo();
        }}
      />
    </ConfirmDialog>
  );
}

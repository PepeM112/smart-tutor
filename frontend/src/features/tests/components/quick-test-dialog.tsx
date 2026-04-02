'use client';

import { Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Routes } from '@/lib/routes';

export function QuickTestDialog() {
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
          Quick Test
        </Button>
      }
      title="Quick Test"
      description="Enter the ID of the test you want to take."
      confirmLabel="Go"
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
        placeholder="Test ID"
        value={testId}
        onChange={e => setTestId(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') handleGo();
        }}
      />
    </ConfirmDialog>
  );
}

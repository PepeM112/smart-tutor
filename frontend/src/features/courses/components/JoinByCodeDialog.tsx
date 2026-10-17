'use client';

import { KeyRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { useJoinByCode } from '../hooks/useJoinByCode';

// Same as `SpaceJoinByCode.code` in the backend.
const CODE_MAX = 32;

export function JoinByCodeDialog() {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" variant="outline" icon={KeyRound}>
          {t('courses.join_with_code')}
        </Button>
      </DialogTrigger>
      {open && <JoinByCodeForm onClose={() => setOpen(false)} />}
    </Dialog>
  );
}

function JoinByCodeForm({ onClose }: { onClose: () => void }) {
  const t = useTranslations();
  const [code, setCode] = useState('');
  const { mutate: joinByCode, isPending: isJoining } = useJoinByCode(onClose);

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (code.trim()) joinByCode(code);
  }

  return (
    <DialogContent>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>{t('courses.join_with_code')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-4">
          <Label htmlFor="join-code">{t('courses.join_code_label')}</Label>
          <Input
            id="join-code"
            value={code}
            onChange={e => setCode(e.target.value)}
            maxLength={CODE_MAX}
            autoComplete="off"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button type="submit" size="lg" disabled={!code.trim()} loading={isJoining}>
            {t('courses.join')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

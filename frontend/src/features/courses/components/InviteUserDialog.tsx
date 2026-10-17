'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { type useCourseActions } from '../hooks/useCourseActions';

/** Same limit as the backend `identifier` field (an email can be 320 characters). */
const IDENTIFIER_MAX_LENGTH = 320;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: ReturnType<typeof useCourseActions>;
};

/** Invite a user by username or email (owner). The Members tab and the Share menu in Settings open it. */
export function InviteUserDialog({ open, onOpenChange, actions }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Mount the form only while open, so each open starts with an empty field. */}
      {open && <InviteForm actions={actions} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function InviteForm({ actions, onDone }: { actions: Props['actions']; onDone: () => void }) {
  const t = useTranslations();
  const [identifier, setIdentifier] = useState('');

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = identifier.trim();
    if (!value) return;
    actions.invite.mutate(value, { onSuccess: onDone });
  }

  return (
    <DialogContent>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>{t('courses.invite_title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="invite-identifier">{t('courses.invite_placeholder')}</Label>
          <Input
            id="invite-identifier"
            autoFocus
            value={identifier}
            onChange={e => setIdentifier(e.target.value)}
            maxLength={IDENTIFIER_MAX_LENGTH}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onDone}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={!identifier.trim()} loading={actions.invite.isPending}>
            {t('courses.invite')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

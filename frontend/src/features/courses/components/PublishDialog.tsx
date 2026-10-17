'use client';

import { Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { type SpacePublishRequest, type SpaceSectionRead } from '@/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { COURSE_LIMITS } from '../lib/limits';

type Props = {
  draftSections: SpaceSectionRead[];
  isPending: boolean;
  /** False when the draft is the same as the published version: publish would give 409. */
  hasChanges: boolean;
  onPublish: (body: SpacePublishRequest, onDone: () => void) => void;
};

/**
 * Publish the draft. The message, "notify" and "reset progress" are stored with the publish:
 * notifications come in M5 and progress in M3, so they have no effect yet.
 */
export function PublishDialog({ draftSections, isPending, hasChanges, onPublish }: Props) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [notifyMembers, setNotifyMembers] = useState(false);
  const [resetItemIds, setResetItemIds] = useState<string[]>([]);

  // Only a changed published item has progress to reset. A new item has none.
  const changedItems = draftSections
    .flatMap(section => section.items)
    .filter(item => item.draftOfId && item.hasChanges);

  function toggleReset(itemId: string, checked: boolean) {
    setResetItemIds(ids => (checked ? [...ids, itemId] : ids.filter(id => id !== itemId)));
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setMessage('');
      setNotifyMembers(false);
      setResetItemIds([]);
    }
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    onPublish({ message: message.trim() || null, notifyMembers, resetItemIds }, () => handleOpenChange(false));
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          icon={Upload}
          disabled={!hasChanges}
          tooltip={hasChanges ? undefined : t('courses.no_changes_to_publish')}
        >
          {t('courses.publish')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t('courses.publish_title')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('courses.publish_hint')}</p>

          <div className="space-y-2">
            <Label htmlFor="publish-message">{t('courses.publish_message_label')}</Label>
            <Textarea
              id="publish-message"
              value={message}
              onChange={e => setMessage(e.target.value)}
              maxLength={COURSE_LIMITS.publishMessage}
              placeholder={t('courses.publish_message_placeholder')}
              rows={3}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="publish-notify"
              checked={notifyMembers}
              onCheckedChange={checked => setNotifyMembers(checked === true)}
            />
            <Label htmlFor="publish-notify" className="cursor-pointer">
              {t('courses.publish_notify')}
            </Label>
          </div>

          {changedItems.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-foreground">{t('courses.publish_reset_label')}</legend>
              <p className="text-xs text-muted-foreground">{t('courses.publish_reset_hint')}</p>
              {changedItems.map(item => (
                <div key={item.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`reset-${item.id}`}
                    checked={resetItemIds.includes(item.id)}
                    onCheckedChange={checked => toggleReset(item.id, checked === true)}
                  />
                  <Label htmlFor={`reset-${item.id}`} className="cursor-pointer truncate">
                    {item.title}
                  </Label>
                </div>
              ))}
            </fieldset>
          )}

          <DialogFooter>
            <Button type="submit" size="lg" loading={isPending}>
              {t('courses.publish')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

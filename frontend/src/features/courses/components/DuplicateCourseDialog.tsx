'use client';

import { Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { type SpaceDetail } from '@/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TagInput } from '@/features/notes/components/TagInput';

import { type useCourseActions } from '../hooks/useCourseActions';
import { COURSE_LIMITS } from '../lib/limits';

type Props = {
  course: SpaceDetail;
  actions: ReturnType<typeof useCourseActions>;
};

/** Duplicate the course: a form with the current details. On success the new course opens. */
export function DuplicateCourseDialog({ course, actions }: Props) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" icon={Copy}>
          {t('courses.duplicate')}
        </Button>
      </DialogTrigger>
      {/* Mount the form only while open, so each open starts from the current course details. */}
      {open && <DuplicateForm course={course} actions={actions} onClose={() => setOpen(false)} />}
    </Dialog>
  );
}

function DuplicateForm({ course, actions, onClose }: Props & { onClose: () => void }) {
  const t = useTranslations();
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description);
  const [tags, setTags] = useState(course.tags);

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    // The mutation opens the new course, so the dialog closes with this page.
    actions.duplicate.mutate({ title: title.trim(), description: description.trim(), tags });
  }

  return (
    <DialogContent>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>{t('courses.duplicate_title')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t('courses.duplicate_hint')}</p>
        <div className="space-y-2">
          <Label htmlFor="duplicate-title">{t('courses.title_label')}</Label>
          <Input
            id="duplicate-title"
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={COURSE_LIMITS.title}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="duplicate-description">{t('courses.description_label')}</Label>
          <Textarea
            id="duplicate-description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={COURSE_LIMITS.description}
            rows={4}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('courses.tags_label')}</Label>
          <TagInput tags={tags} onChange={setTags} />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={!title.trim()} loading={actions.duplicate.isPending}>
            {t('courses.duplicate')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

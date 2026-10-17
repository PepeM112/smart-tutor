'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { SpaceVisibility } from '@/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { sdk } from '@/lib/apiClient';
import { courseHref } from '@/lib/routes';
import { getErrorDetail } from '@/lib/utils';

import { COURSE_LIMITS } from '../lib/limits';
import { applyCourseDetail } from '../lib/queryKeys';

import { VisibilitySelect } from './VisibilitySelect';

export function CreateCourseDialog() {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" icon={Plus}>
          {t('courses.create_course')}
        </Button>
      </DialogTrigger>
      {open && <CreateCourseForm onClose={() => setOpen(false)} />}
    </Dialog>
  );
}

function CreateCourseForm({ onClose }: { onClose: () => void }) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<SpaceVisibility>(SpaceVisibility.PRIVATE);

  const { mutate: createCourse, isPending: isCreating } = useMutation({
    mutationFn: async () =>
      (
        await sdk.spacesCreate({
          body: { title: title.trim(), description: description.trim(), visibility },
          throwOnError: true,
        })
      ).data,
    onSuccess: detail => {
      applyCourseDetail(queryClient, detail);
      toast.success(t('courses.course_created'));
      onClose();
      router.push(courseHref(detail));
    },
    onError: err => toast.error(getErrorDetail(err, t('courses.failed_to_create'))),
  });

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (title.trim()) createCourse();
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>{t('courses.create_course')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="course-title">{t('courses.title_label')}</Label>
            <Input
              id="course-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={COURSE_LIMITS.title}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="course-description">{t('courses.description_label')}</Label>
            <Textarea
              id="course-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={COURSE_LIMITS.description}
              rows={3}
            />
          </div>
          <VisibilitySelect value={visibility} onChange={setVisibility} />
        </div>
        <DialogFooter>
          <Button type="submit" size="lg" disabled={!title.trim()} loading={isCreating}>
            {t('courses.create_course')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

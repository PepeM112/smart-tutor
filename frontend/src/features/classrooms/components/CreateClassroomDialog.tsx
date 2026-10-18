'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { SpaceVisibility } from '@/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { VisibilitySelect } from '@/features/courses/components/VisibilitySelect';
import { CLASSROOM_VISIBILITY } from '@/features/courses/lib/labels';
import { COURSE_LIMITS } from '@/features/courses/lib/limits';
import { applyCourseDetail } from '@/features/courses/lib/queryKeys';
import { sdk } from '@/lib/apiClient';
import { classroomHref } from '@/lib/routes';
import { getErrorDetail } from '@/lib/utils';

export function CreateClassroomDialog() {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" icon={Plus}>
          {t('classrooms.create_classroom')}
        </Button>
      </DialogTrigger>
      {open && <CreateClassroomForm onClose={() => setOpen(false)} />}
    </Dialog>
  );
}

function CreateClassroomForm({ onClose }: { onClose: () => void }) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<SpaceVisibility>(SpaceVisibility.PRIVATE);

  const { mutate: createClassroom, isPending: isCreating } = useMutation({
    mutationFn: async () =>
      (
        await sdk.classroomsCreate({
          body: {
            title: title.trim(),
            description: description.trim(),
            // The API takes private or unlisted only (the select offers no other value).
            visibility: visibility === SpaceVisibility.UNLISTED ? SpaceVisibility.UNLISTED : SpaceVisibility.PRIVATE,
          },
          throwOnError: true,
        })
      ).data,
    onSuccess: detail => {
      applyCourseDetail(queryClient, detail);
      toast.success(t('classrooms.classroom_created'));
      onClose();
      router.push(classroomHref(detail));
    },
    onError: err => toast.error(getErrorDetail(err, t('classrooms.failed_to_create'))),
  });

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (title.trim()) createClassroom();
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>{t('classrooms.create_classroom')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="classroom-title">{t('courses.title_label')}</Label>
            <Input
              id="classroom-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={COURSE_LIMITS.title}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="classroom-description">{t('courses.description_label')}</Label>
            <Textarea
              id="classroom-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={COURSE_LIMITS.description}
              rows={3}
            />
          </div>
          <VisibilitySelect value={visibility} onChange={setVisibility} options={CLASSROOM_VISIBILITY} />
        </div>
        <DialogFooter>
          <Button type="submit" size="lg" disabled={!title.trim()} loading={isCreating}>
            {t('classrooms.create_classroom')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

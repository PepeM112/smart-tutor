'use client';

import { useQuery } from '@tanstack/react-query';
import { BookOpen, FileText, GraduationCap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { SpaceItemKind, SpaceRole, type SpaceSummary } from '@/client';
import { SearchInput } from '@/components/shared/SearchInput';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFileTree } from '@/features/files/hooks/useFileTree';
import { useAllTests } from '@/features/tests/hooks/useAllTests';
import { sdk } from '@/lib/apiClient';
import { displayTitle } from '@/lib/displayTitle';
import { cn } from '@/lib/utils';

import { COURSE_LIMITS } from '../lib/limits';
import { courseQueryKeys, type MyCoursesParams } from '../lib/queryKeys';

/** A COURSE item is added in a classroom only. */
export type AddItemMode = {
  action: 'create' | 'copy';
  kind: SpaceItemKind.NOTE | SpaceItemKind.TEST | SpaceItemKind.COURSE;
};

/** A personal note / test, or a standalone course, that can be copied. Only a course has a description. */
export type CopySource = { id: string; title: string; description?: string };

const ADD_TITLE_KEYS: Record<AddItemMode['kind'], { create: string; copy: string }> = {
  [SpaceItemKind.NOTE]: { create: 'courses.new_note', copy: 'courses.copy_note' },
  [SpaceItemKind.TEST]: { create: 'courses.new_test', copy: 'courses.copy_test' },
  [SpaceItemKind.COURSE]: { create: 'classrooms.new_course', copy: 'classrooms.duplicate_course' },
};

const COPY_ICONS = {
  [SpaceItemKind.NOTE]: FileText,
  [SpaceItemKind.TEST]: BookOpen,
  [SpaceItemKind.COURSE]: GraduationCap,
} as const;

// Standalone courses the user can copy: the backend needs author rights on the source.
const COURSE_SOURCE_PARAMS: MyCoursesParams = { role: [SpaceRole.OWNER, SpaceRole.EDITOR] };

type Props = {
  mode: AddItemMode | null;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  isPending: boolean;
  /** `create`: a new empty note / test with this title. */
  onCreate: (title: string) => void;
  /** `copy`: the personal note / test (or the standalone course) to copy. */
  onCopy: (source: CopySource) => void;
};

/** Add an item to a draft section: a new note / test / course, or a copy of a personal one. */
export function AddItemDialog({ mode, onOpenChange, onCloseAutoFocus, isPending, onCreate, onCopy }: Props) {
  return (
    <Dialog open={mode !== null} onOpenChange={onOpenChange}>
      {mode &&
        (mode.action === 'create' ? (
          <CreateItemForm
            kind={mode.kind}
            isPending={isPending}
            onCreate={onCreate}
            onCloseAutoFocus={onCloseAutoFocus}
          />
        ) : (
          <CopyItemForm kind={mode.kind} isPending={isPending} onCopy={onCopy} onCloseAutoFocus={onCloseAutoFocus} />
        ))}
    </Dialog>
  );
}

function CreateItemForm({
  kind,
  isPending,
  onCreate,
  onCloseAutoFocus,
}: {
  kind: AddItemMode['kind'];
  isPending: boolean;
  onCreate: (title: string) => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const t = useTranslations();
  const [title, setTitle] = useState('');

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (title.trim()) onCreate(title.trim());
  }

  return (
    <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>{t(ADD_TITLE_KEYS[kind].create)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-4">
          <Label htmlFor="item-title">{t('courses.title_label')}</Label>
          <Input
            id="item-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={COURSE_LIMITS.title}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button type="submit" size="lg" disabled={!title.trim()} loading={isPending}>
            {t('courses.create')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function CopyItemForm({
  kind,
  isPending,
  onCopy,
  onCloseAutoFocus,
}: {
  kind: AddItemMode['kind'];
  isPending: boolean;
  onCopy: (source: CopySource) => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const t = useTranslations();
  const isNote = kind === SpaceItemKind.NOTE;
  const isCourse = kind === SpaceItemKind.COURSE;
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // The file tree and the test list hold personal content only, so every row can be copied.
  const { notes, isLoading: isLoadingNotes } = useFileTree();
  const { data: tests = [], isLoading: isLoadingTests } = useAllTests(kind === SpaceItemKind.TEST);
  const { data: courses = [], isLoading: isLoadingCourses } = useQuery({
    queryKey: courseQueryKeys.mine(COURSE_SOURCE_PARAMS),
    queryFn: async (): Promise<SpaceSummary[]> =>
      (await sdk.spacesListMine({ query: COURSE_SOURCE_PARAMS, throwOnError: true })).data,
    enabled: isCourse,
  });

  const sources = useMemo<CopySource[]>(() => {
    const all: CopySource[] = isCourse
      ? courses.map(course => ({ id: course.id, title: course.title, description: course.description }))
      : isNote
        ? notes.map(note => ({ id: note.id, title: displayTitle(note.title, t) }))
        : tests.map(test => ({ id: test.id, title: test.title }));
    const query = search.trim().toLowerCase();
    return query ? all.filter(source => source.title.toLowerCase().includes(query)) : all;
  }, [isCourse, isNote, courses, notes, tests, search, t]);

  const isLoading = isCourse ? isLoadingCourses : isNote ? isLoadingNotes : isLoadingTests;
  const Icon = COPY_ICONS[kind];
  const selectedSource = sources.find(source => source.id === selectedId);

  return (
    <DialogContent onCloseAutoFocus={onCloseAutoFocus} className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{t(ADD_TITLE_KEYS[kind].copy)}</DialogTitle>
      </DialogHeader>
      <p className="text-sm text-muted-foreground">{t(isCourse ? 'classrooms.duplicate_hint' : 'courses.copy_hint')}</p>
      <SearchInput value={search} onChange={setSearch} placeholder={t('common.search')} />
      <ul className="max-h-72 overflow-y-auto rounded-lg border border-border" role="listbox">
        {isLoading && <li className="px-3 py-2 text-sm text-muted-foreground">{t('common.loading')}</li>}
        {!isLoading && sources.length === 0 && (
          <li className="px-3 py-2 text-sm text-muted-foreground">{t('common.no_data_found')}</li>
        )}
        {sources.map(source => (
          <li key={source.id} role="option" aria-selected={source.id === selectedId}>
            <button
              type="button"
              onClick={() => setSelectedId(source.id)}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50',
                source.id === selectedId && 'bg-accent text-accent-foreground'
              )}
            >
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{source.title}</span>
            </button>
          </li>
        ))}
      </ul>
      <DialogFooter>
        <Button
          size="lg"
          disabled={!selectedSource}
          loading={isPending}
          onClick={() => selectedSource && onCopy(selectedSource)}
        >
          {t(isCourse ? 'classrooms.copy_into_classroom' : 'courses.copy_into_course')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

'use client';

import { BookOpen, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { SpaceItemKind } from '@/client';
import { SearchInput } from '@/components/shared/SearchInput';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFileTree } from '@/features/files/hooks/useFileTree';
import { useAllTests } from '@/features/tests/hooks/useAllTests';
import { displayTitle } from '@/lib/displayTitle';
import { cn } from '@/lib/utils';

import { COURSE_LIMITS } from '../lib/limits';

export type AddItemMode = { action: 'create' | 'copy'; kind: SpaceItemKind.NOTE | SpaceItemKind.TEST };

type Props = {
  mode: AddItemMode | null;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  /** `create`: a new empty note / test with this title. */
  onCreate: (title: string) => void;
  /** `copy`: the id of the personal note / test to copy into the course. */
  onCopy: (sourceId: string) => void;
};

/** Add an item to a draft section: a new note / test, or a copy of a personal one. */
export function AddItemDialog({ mode, onOpenChange, isPending, onCreate, onCopy }: Props) {
  return (
    <Dialog open={mode !== null} onOpenChange={onOpenChange}>
      {mode &&
        (mode.action === 'create' ? (
          <CreateItemForm kind={mode.kind} isPending={isPending} onCreate={onCreate} />
        ) : (
          <CopyItemForm kind={mode.kind} isPending={isPending} onCopy={onCopy} />
        ))}
    </Dialog>
  );
}

function CreateItemForm({
  kind,
  isPending,
  onCreate,
}: {
  kind: AddItemMode['kind'];
  isPending: boolean;
  onCreate: (title: string) => void;
}) {
  const t = useTranslations();
  const [title, setTitle] = useState('');

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (title.trim()) onCreate(title.trim());
  }

  return (
    <DialogContent>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>{t(kind === SpaceItemKind.NOTE ? 'courses.new_note' : 'courses.new_test')}</DialogTitle>
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

type Source = { id: string; title: string };

function CopyItemForm({
  kind,
  isPending,
  onCopy,
}: {
  kind: AddItemMode['kind'];
  isPending: boolean;
  onCopy: (sourceId: string) => void;
}) {
  const t = useTranslations();
  const isNote = kind === SpaceItemKind.NOTE;
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // The file tree and the test list hold personal content only, so every row can be copied.
  const { notes, isLoading: isLoadingNotes } = useFileTree();
  const { data: tests = [], isLoading: isLoadingTests } = useAllTests(!isNote);

  const sources = useMemo<Source[]>(() => {
    const all = isNote
      ? notes.map(note => ({ id: note.id, title: displayTitle(note.title, t) }))
      : tests.map(test => ({ id: test.id, title: test.title }));
    const query = search.trim().toLowerCase();
    return query ? all.filter(source => source.title.toLowerCase().includes(query)) : all;
  }, [isNote, notes, tests, search, t]);

  const isLoading = isNote ? isLoadingNotes : isLoadingTests;
  const Icon = isNote ? FileText : BookOpen;

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{t(isNote ? 'courses.copy_note' : 'courses.copy_test')}</DialogTitle>
      </DialogHeader>
      <p className="text-sm text-muted-foreground">{t('courses.copy_hint')}</p>
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
        <Button size="lg" disabled={!selectedId} loading={isPending} onClick={() => selectedId && onCopy(selectedId)}>
          {t('courses.copy_into_course')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

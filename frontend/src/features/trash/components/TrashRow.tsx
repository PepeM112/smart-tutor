'use client';

import { Folder, NotepadText } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

import { TreeChevron } from '@/features/files/components/TreeChevron';
import { TreeRowShell } from '@/features/files/components/TreeRowShell';
import { displayTitle } from '@/lib/displayTitle';
import { formatDate } from '@/lib/format';

import { useTrashTable } from '../context/TrashTableContext';
import { type TrashTarget } from '../hooks/useTrashMutations';

import { TrashRowActions } from './TrashRowActions';

type Props = {
  target: TrashTarget;
  /** Folder name or note title. A note with an empty title shows "Untitled". */
  name: string;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  onToggle: () => void;
  /**
   * Top-level rows only. A string is the original path, `null` means the path is unknown.
   * Leave out for a sub-item: it was trashed with its parent, so it has no location of its own.
   */
  location?: string | null;
  /** Top-level rows only, like `location`. */
  deletedAt?: Date;
};

/** One row of the Trash table: the same row shell, chevron, icon and cells as a Files row. */
export function TrashRow({ target, name, depth, hasChildren, expanded, onToggle, location, deletedAt }: Props) {
  const t = useTranslations();
  const format = useFormatter();
  const { now } = useTrashTable();

  const isFolder = target.kind === 'folder';
  const label = isFolder ? name : displayTitle(name, t);
  const Icon = isFolder ? Folder : NotepadText;

  return (
    <TreeRowShell
      depth={depth}
      expanded={hasChildren ? expanded : undefined}
      onClick={hasChildren ? onToggle : undefined}
    >
      <TreeChevron hasChildren={hasChildren} expanded={expanded} onToggle={onToggle} />
      <Icon className={isFolder ? 'size-4 shrink-0 text-primary/70' : 'size-4 shrink-0 text-muted-foreground'} />

      <div className="flex min-w-0 flex-1 items-center">
        <span className="truncate font-medium text-foreground">{label}</span>
      </div>

      {/* Location and Deleted cells stay in sub-item rows (empty), so the columns line up. */}
      <span
        className="hidden w-48 shrink-0 truncate text-xs text-muted-foreground md:block"
        title={location ?? undefined}
      >
        {location === undefined ? null : (location ?? t('files.no_folder'))}
      </span>
      <span
        className="hidden w-28 shrink-0 truncate text-right text-xs text-muted-foreground sm:block"
        title={deletedAt ? formatDate(deletedAt) : undefined}
      >
        {deletedAt ? format.relativeTime(deletedAt, now) : null}
      </span>

      <TrashRowActions target={target} name={label} />
    </TreeRowShell>
  );
}

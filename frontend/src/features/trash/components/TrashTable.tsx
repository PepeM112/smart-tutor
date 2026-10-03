'use client';

import { useNow, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { type TrashItemRead } from '@/client';
import { TreeHeaderRow } from '@/features/files/components/TreeHeaderRow';
import { TRASH_ACTIONS_CELL_WIDTH_CLASS } from '@/features/files/lib/treeLayout';

import { TrashTableContext, type TrashTableContextValue } from '../context/TrashTableContext';
import { useTrashMutations } from '../hooks/useTrashMutations';

import { TrashRow } from './TrashRow';
import { TrashTree } from './TrashTree';

type Props = {
  items: TrashItemRead[];
};

/**
 * Trash as the same tree table as Files: header, rows, chevrons and hover actions.
 * The rows are the top-level trashed items. A trashed folder loads its contents on expand.
 * There is no drag and drop here.
 */
export function TrashTable({ items }: Props) {
  const t = useTranslations();
  const { restoreItem, isRestoring, hardDeleteItem, isHardDeleting } = useTrashMutations();
  // Explicit `now` (updates each minute): without it next-intl warns, and server and client can disagree.
  const now = useNow({ updateInterval: 60_000 });
  const isBusy = isRestoring || isHardDeleting;

  const context = useMemo<TrashTableContextValue>(
    () => ({ restoreItem, hardDeleteItem, isBusy, now }),
    [restoreItem, hardDeleteItem, isBusy, now]
  );

  return (
    <TrashTableContext.Provider value={context}>
      <div role="treegrid" aria-label={t('trash.title')} className="w-full">
        <TreeHeaderRow actionsWidthClass={TRASH_ACTIONS_CELL_WIDTH_CLASS}>
          <span className="flex-1">{t('trash.col_name')}</span>
          <span className="hidden w-48 md:block">{t('trash.col_original_location')}</span>
          <span className="hidden w-28 text-right sm:block">{t('trash.col_deleted')}</span>
        </TreeHeaderRow>
        <div className="py-1">
          {items.map(item => (
            <TrashItemRow key={`${item.kind}-${item.id}`} item={item} />
          ))}
        </div>
      </div>
    </TrashTableContext.Provider>
  );
}

// ─── Top-level row ───────────────────────────────────────────────────────────

function TrashItemRow({ item }: { item: TrashItemRead }) {
  const [expanded, setExpanded] = useState(false);
  // Only a folder that held other items has a tree to show.
  const hasContents = item.kind === 'folder' && item.folderCount + item.noteCount > 0;

  return (
    <>
      <TrashRow
        target={{ kind: item.kind, id: item.id }}
        name={item.name}
        depth={0}
        hasChildren={hasContents}
        expanded={expanded}
        onToggle={() => setExpanded(open => !open)}
        location={item.originalPath}
        deletedAt={item.deletedAt}
      />
      {expanded && hasContents && <TrashTree folderId={item.id} depth={1} />}
    </>
  );
}

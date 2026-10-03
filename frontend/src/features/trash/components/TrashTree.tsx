'use client';

import { useQuery } from '@tanstack/react-query';
import { Folder, NotepadText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useMemo, useState } from 'react';

import { type FileTreeFolder, type FileTreeNote } from '@/client';
import { QueryState } from '@/components/shared/QueryState';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TreeChevron } from '@/features/files/components/TreeChevron';
import { TreeRowShell } from '@/features/files/components/TreeRowShell';
import { buildChildrenIndex, type ChildrenIndex } from '@/features/files/lib/fileTree';
import { fileQueryKeys } from '@/features/files/lib/queryKeys';
import { sdk } from '@/lib/apiClient';
import { displayTitle } from '@/lib/displayTitle';

import { type TrashTarget, useTrashMutations } from '../hooks/useTrashMutations';

type Props = {
  /** The trashed folder at the top of the batch. */
  folderId: string;
};

/**
 * The items that were trashed together with a folder, as a tree. Each item can be restored
 * or deleted forever on its own. The query runs only when this component mounts (the
 * parent mounts it when the row is expanded).
 */
export function TrashTree({ folderId }: Props) {
  const t = useTranslations();
  const { restoreItem, isRestoring, hardDeleteItem, isHardDeleting } = useTrashMutations();

  const {
    data: res,
    isLoading,
    isError,
  } = useQuery({
    queryKey: fileQueryKeys.trashTree(folderId),
    queryFn: () => sdk.trashFolderTree({ path: { folder_id: folderId } }),
  });
  const tree = res?.data;
  const childrenIndex = useMemo(() => (tree ? buildChildrenIndex(tree) : null), [tree]);

  return (
    <QueryState isLoading={isLoading} isError={isError} errorMessage={t('trash.failed_to_load_tree')}>
      {childrenIndex && (
        <TrashBranch
          parentId={folderId}
          depth={0}
          childrenIndex={childrenIndex}
          actions={{ restoreItem, hardDeleteItem, isBusy: isRestoring || isHardDeleting }}
        />
      )}
    </QueryState>
  );
}

// ─── Branch ──────────────────────────────────────────────────────────────────

type Actions = {
  restoreItem: (target: TrashTarget) => void;
  hardDeleteItem: (target: TrashTarget) => void;
  isBusy: boolean;
};

type BranchProps = {
  parentId: string;
  depth: number;
  childrenIndex: ChildrenIndex;
  actions: Actions;
};

function TrashBranch({ parentId, depth, childrenIndex, actions }: BranchProps) {
  const children = childrenIndex.get(parentId);
  return (
    <>
      {children?.folders.map(folder => (
        <TrashFolderRow key={folder.id} folder={folder} depth={depth} childrenIndex={childrenIndex} actions={actions} />
      ))}
      {children?.notes.map(note => (
        <TrashNoteRow key={note.id} note={note} depth={depth} actions={actions} />
      ))}
    </>
  );
}

function TrashFolderRow({
  folder,
  depth,
  childrenIndex,
  actions,
}: {
  folder: FileTreeFolder;
  depth: number;
  childrenIndex: ChildrenIndex;
  actions: Actions;
}) {
  const [expanded, setExpanded] = useState(false);
  const children = childrenIndex.get(folder.id);
  const hasChildren = (children?.folders.length ?? 0) + (children?.notes.length ?? 0) > 0;

  return (
    <>
      <TreeRowShell
        depth={depth}
        expanded={hasChildren ? expanded : undefined}
        onClick={() => hasChildren && setExpanded(open => !open)}
      >
        <TreeChevron hasChildren={hasChildren} expanded={expanded} onToggle={() => setExpanded(open => !open)} />
        <Folder className="size-4 shrink-0 text-primary/70" />
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">{folder.name}</span>
        <TrashRowActions target={{ kind: 'folder', id: folder.id }} name={folder.name} actions={actions} />
      </TreeRowShell>
      {expanded && hasChildren && (
        <TrashBranch parentId={folder.id} depth={depth + 1} childrenIndex={childrenIndex} actions={actions} />
      )}
    </>
  );
}

function TrashNoteRow({ note, depth, actions }: { note: FileTreeNote; depth: number; actions: Actions }) {
  const t = useTranslations();
  const title = displayTitle(note.title, t);

  return (
    <TreeRowShell depth={depth} onClick={() => undefined}>
      <TreeChevron hasChildren={false} expanded={false} onToggle={() => undefined} />
      <NotepadText className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-medium text-foreground">{title}</span>
      <TrashRowActions target={{ kind: 'note', id: note.id }} name={title} actions={actions} />
    </TreeRowShell>
  );
}

// ─── Row actions ─────────────────────────────────────────────────────────────

function TrashRowActions({
  target,
  name,
  actions,
}: {
  target: TrashTarget;
  name: string;
  actions: Actions;
}): ReactNode {
  const t = useTranslations();
  const { restoreItem, hardDeleteItem, isBusy } = actions;

  // Stops clicks (also from the dialog, which bubbles through the React tree) before they toggle the row.
  return (
    <div className="flex shrink-0 items-center gap-1" onClick={e => e.stopPropagation()}>
      <Button size="sm" variant="outline" onClick={() => restoreItem(target)} disabled={isBusy}>
        {t('trash.restore')}
      </Button>
      <ConfirmDialog
        trigger={
          <Button size="sm" variant="ghost" disabled={isBusy}>
            {t('trash.delete_forever')}
          </Button>
        }
        title={t('trash.delete_forever_title')}
        description={t('trash.delete_forever_confirm', { name })}
        confirmLabel={t('trash.delete_forever')}
        confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        disableConfirm={isBusy}
        onConfirm={() => hardDeleteItem(target)}
      />
    </div>
  );
}

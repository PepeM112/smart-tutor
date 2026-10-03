'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useMemo, useState } from 'react';

import { type FileTreeFolder, type FileTreeNote } from '@/client';
import { buildChildrenIndex, type ChildrenIndex, hasChildItems } from '@/features/files/lib/fileTree';
import { fileQueryKeys } from '@/features/files/lib/queryKeys';
import { TREE_INDENT_STEP_PX, TREE_NAME_OFFSET_PX, TREE_ROW_BASE_PADDING_PX } from '@/features/files/lib/treeLayout';
import { sdk } from '@/lib/apiClient';

import { TrashRow } from './TrashRow';

type Props = {
  /** The trashed folder at the top of the batch. */
  folderId: string;
  /** Depth of the rows of this level (the depth of the trashed folder + 1). */
  depth: number;
};

/**
 * The rows of the items that were trashed together with a folder. Each row can be
 * restored or deleted forever on its own. The query runs only when this component mounts
 * (the parent mounts it when the folder row is expanded).
 */
export function TrashTree({ folderId, depth }: Props) {
  const t = useTranslations();

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

  if (isLoading) {
    return (
      <StatusRow depth={depth}>
        <Loader2 className="size-4 animate-spin" />
      </StatusRow>
    );
  }
  if (isError || !childrenIndex) {
    return <StatusRow depth={depth}>{t('trash.failed_to_load_tree')}</StatusRow>;
  }

  return <TrashBranch parentId={folderId} depth={depth} childrenIndex={childrenIndex} />;
}

// ─── Status row ──────────────────────────────────────────────────────────────

/** A row-shaped message under a folder row (loading or error). Its text starts at the name column. */
function StatusRow({ depth, children }: { depth: number; children: ReactNode }) {
  return (
    <div
      role="row"
      className="flex items-center py-1.5 pr-2 text-sm text-muted-foreground"
      style={{ paddingLeft: `${depth * TREE_INDENT_STEP_PX + TREE_ROW_BASE_PADDING_PX + TREE_NAME_OFFSET_PX}px` }}
    >
      {children}
    </div>
  );
}

// ─── Branch ──────────────────────────────────────────────────────────────────

type BranchProps = {
  parentId: string;
  depth: number;
  childrenIndex: ChildrenIndex;
};

function TrashBranch({ parentId, depth, childrenIndex }: BranchProps) {
  const children = childrenIndex.get(parentId);
  return (
    <>
      {children?.folders.map(folder => (
        <TrashFolderRow key={folder.id} folder={folder} depth={depth} childrenIndex={childrenIndex} />
      ))}
      {children?.notes.map(note => (
        <TrashNoteRow key={note.id} note={note} depth={depth} />
      ))}
    </>
  );
}

type FolderRowProps = {
  folder: FileTreeFolder;
  depth: number;
  childrenIndex: ChildrenIndex;
};

function TrashFolderRow({ folder, depth, childrenIndex }: FolderRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = hasChildItems(childrenIndex, folder.id);

  return (
    <>
      <TrashRow
        target={{ kind: 'folder', id: folder.id }}
        name={folder.name}
        depth={depth}
        hasChildren={hasChildren}
        expanded={expanded}
        onToggle={() => setExpanded(open => !open)}
      />
      {expanded && hasChildren && <TrashBranch parentId={folder.id} depth={depth + 1} childrenIndex={childrenIndex} />}
    </>
  );
}

function TrashNoteRow({ note, depth }: { note: FileTreeNote; depth: number }) {
  return (
    <TrashRow
      target={{ kind: 'note', id: note.id }}
      name={note.title}
      depth={depth}
      hasChildren={false}
      expanded={false}
      onToggle={() => undefined}
    />
  );
}

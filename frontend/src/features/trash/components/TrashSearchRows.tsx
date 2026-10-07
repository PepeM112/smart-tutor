'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { type TrashItemRead, type TrashTreeFolder, type TrashTreeNote } from '@/client';
import { filterTree, hasChildItems, type TreeFilter } from '@/features/files/lib/fileTree';
import { fileQueryKeys } from '@/features/files/lib/queryKeys';
import { sdk } from '@/lib/apiClient';

import { buildTrashIndex, type TrashSearchIndex } from '../lib/trashSearch';

import { TrashRow } from './TrashRow';

type Props = {
  query: string;
  /** The top-level trash items. They give each root row its original location. */
  items: TrashItemRead[];
};

/**
 * Trash rows while a search is active. The search needs every trashed item, so it loads the whole
 * trash in one request. It runs only while this component is mounted (the table mounts it only
 * when the query is not empty). Without a query, the table keeps its lazy per-folder loading.
 */
export function TrashSearchRows({ query, items }: Props) {
  const t = useTranslations();

  const {
    data: res,
    isLoading,
    isError,
  } = useQuery({
    queryKey: fileQueryKeys.trashFullTree(),
    queryFn: () => sdk.trashTree(),
  });
  const tree = res?.data;

  const index = useMemo(() => (tree ? buildTrashIndex(tree) : null), [tree]);
  const filter = useMemo(() => (index ? filterTree(index, null, query) : null), [index, query]);
  const rootInfo = useMemo(() => new Map(items.map(item => [`${item.kind}-${item.id}`, item])), [items]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }
  if (isError || !index || !filter) {
    return <p className="px-2 py-8 text-center text-sm text-muted-foreground">{t('trash.failed_to_load_tree')}</p>;
  }
  if (filter.visibleIds.size === 0) {
    return (
      <p className="px-2 py-8 text-center text-sm text-muted-foreground">
        {t('trash.no_search_results', { query: query.trim() })}
      </p>
    );
  }

  return (
    <SearchBranch key={query.trim()} parentId={null} depth={0} index={index} filter={filter} rootInfo={rootInfo} />
  );
}

type BranchProps = {
  parentId: string | null;
  depth: number;
  index: TrashSearchIndex;
  filter: TreeFilter;
  rootInfo: Map<string, TrashItemRead>;
};

function SearchBranch({ parentId, depth, index, filter, rootInfo }: BranchProps) {
  const children = index.get(parentId);
  return (
    <>
      {children?.folders
        .filter(folder => filter.visibleIds.has(folder.id))
        .map(folder => (
          <SearchFolderRow
            key={folder.id}
            folder={folder}
            depth={depth}
            index={index}
            filter={filter}
            rootInfo={rootInfo}
          />
        ))}
      {children?.notes
        .filter(note => filter.visibleIds.has(note.id))
        .map(note => (
          <SearchNoteRow key={note.id} note={note} depth={depth} rootInfo={rootInfo} />
        ))}
    </>
  );
}

/** Only top-level rows show a location and a delete date (same as the lazy table). */
function rootCells(
  depth: number,
  info: TrashItemRead | undefined,
  deletedAt: Date
): { location?: string | null; deletedAt?: Date } {
  if (depth !== 0) return {};
  return { location: info?.originalPath ?? null, deletedAt: info?.deletedAt ?? deletedAt };
}

type FolderRowProps = Omit<BranchProps, 'parentId'> & { folder: TrashTreeFolder };

function SearchFolderRow({ folder, depth, index, filter, rootInfo }: FolderRowProps) {
  // The user's own choice, or null = follow the search (it opens the folders on the path to a match).
  // Without the override, a click on a folder that the search opened would change nothing on screen.
  // The parent has `key={query}`, so a new query starts with no overrides.
  const [override, setOverride] = useState<boolean | null>(null);
  const hasChildren = hasChildItems(index, folder.id);
  const isOpen = override ?? filter.forcedExpanded.has(folder.id);

  return (
    <>
      <TrashRow
        target={{ kind: 'folder', id: folder.id }}
        name={folder.name}
        depth={depth}
        hasChildren={hasChildren}
        expanded={isOpen}
        onToggle={() => setOverride(!isOpen)}
        {...rootCells(depth, rootInfo.get(`folder-${folder.id}`), folder.deletedAt)}
      />
      {isOpen && hasChildren && (
        <SearchBranch parentId={folder.id} depth={depth + 1} index={index} filter={filter} rootInfo={rootInfo} />
      )}
    </>
  );
}

function SearchNoteRow({
  note,
  depth,
  rootInfo,
}: {
  note: TrashTreeNote;
  depth: number;
  rootInfo: Map<string, TrashItemRead>;
}) {
  return (
    <TrashRow
      target={{ kind: 'note', id: note.id }}
      name={note.title}
      depth={depth}
      {...rootCells(depth, rootInfo.get(`note-${note.id}`), note.deletedAt)}
    />
  );
}

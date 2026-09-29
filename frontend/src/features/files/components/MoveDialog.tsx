'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Folder, FolderOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { type FolderRead } from '@/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { sdk } from '@/lib/apiClient';
import { cn } from '@/lib/utils';

import { fileQueryKeys } from '../lib/queryKeys';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ID of item being moved — used to disable itself and its descendants */
  movingFolderId?: string | null;
  /** Current folder of the item being moved — used to pre-select */
  currentParentId?: string | null;
  isPending?: boolean;
  onConfirm: (targetFolderId: string | null) => void;
};

/** Collect a folder's subtree IDs (inclusive) from the flat list. */
function collectDescendants(folderId: string, all: FolderRead[]): Set<string> {
  const result = new Set<string>([folderId]);
  const queue = [folderId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    all
      .filter(f => f.parentId === current)
      .forEach(child => {
        result.add(child.id);
        queue.push(child.id);
      });
  }
  return result;
}

type TreeNodeProps = {
  folder: FolderRead;
  all: FolderRead[];
  disabledIds: Set<string>;
  selected: string | null;
  onSelect: (id: string) => void;
  depth: number;
};

function TreeNode({ folder, all, disabledIds, selected, onSelect, depth }: TreeNodeProps) {
  const children = all.filter(f => f.parentId === folder.id);
  const [expanded, setExpanded] = useState(false);
  const isDisabled = disabledIds.has(folder.id);
  const isSelected = selected === folder.id;

  const Icon = isSelected || expanded ? FolderOpen : Folder;

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm cursor-pointer select-none',
          isDisabled
            ? 'opacity-40 cursor-not-allowed text-muted-foreground'
            : isSelected
              ? 'bg-accent text-accent-foreground font-medium'
              : 'hover:bg-accent/60 text-foreground'
        )}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => {
          if (isDisabled) return;
          if (children.length > 0) setExpanded(e => !e);
          onSelect(folder.id);
        }}
      >
        {children.length > 0 ? (
          <ChevronRight
            className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-90')}
          />
        ) : (
          <span className="size-3.5 shrink-0" />
        )}
        <Icon className="size-4 shrink-0" />
        <span className="truncate flex-1">{folder.name}</span>
      </div>
      {expanded &&
        children.map(child => (
          <TreeNode
            key={child.id}
            folder={child}
            all={all}
            disabledIds={disabledIds}
            selected={selected}
            onSelect={onSelect}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}

export function MoveDialog({ open, onOpenChange, movingFolderId, currentParentId, isPending, onConfirm }: Props) {
  const t = useTranslations();
  // null = root selected; undefined = nothing selected yet
  const [selected, setSelected] = useState<string | null | undefined>(undefined);

  const { data: foldersRes } = useQuery({
    queryKey: fileQueryKeys.folders(),
    queryFn: () => sdk.foldersList(),
    enabled: open,
  });

  const allFolders = useMemo(() => foldersRes?.data ?? [], [foldersRes]);

  const disabledIds = useMemo(
    () => (movingFolderId ? collectDescendants(movingFolderId, allFolders) : new Set<string>()),
    [movingFolderId, allFolders]
  );

  const roots = allFolders.filter(f => f.parentId === null);

  const effectiveSelected = selected === undefined ? (currentParentId ?? null) : selected;

  function handleConfirm() {
    onConfirm(effectiveSelected);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={v => {
        onOpenChange(v);
        if (!v) setSelected(undefined);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('files.move_to')}</DialogTitle>
        </DialogHeader>

        <div className="max-h-72 overflow-y-auto border rounded-md">
          <div className="p-1">
            {/* Root entry */}
            <div
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm cursor-pointer select-none',
                effectiveSelected === null
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'hover:bg-accent/60 text-foreground'
              )}
              onClick={() => setSelected(null)}
            >
              <Folder className="size-4 shrink-0" />
              <span>{t('files.root')}</span>
            </div>

            {roots.map(folder => (
              <TreeNode
                key={folder.id}
                folder={folder}
                all={allFolders}
                disabledIds={disabledIds}
                selected={effectiveSelected}
                onSelect={setSelected}
                depth={0}
              />
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {t('common.cancel')}
          </Button>
          <Button size="lg" onClick={handleConfirm} disabled={isPending}>
            {t('files.move')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

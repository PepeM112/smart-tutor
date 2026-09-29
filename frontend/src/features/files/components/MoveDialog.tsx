'use client';

import { ChevronRight, Folder, FolderOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { type FileTreeFolder } from '@/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

import { useFolders } from '../hooks/useFolders';
import { TREE_INDENT_STEP_PX } from '../lib/treeLayout';

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

export function MoveDialog({ open, onOpenChange, movingFolderId, currentParentId, isPending, onConfirm }: Props) {
  const t = useTranslations();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('files.move_to')}</DialogTitle>
        </DialogHeader>
        {/* DialogContent unmounts when closed, so the body starts fresh on each open. */}
        <MoveDialogBody
          movingFolderId={movingFolderId}
          currentParentId={currentParentId ?? null}
          isPending={isPending}
          onCancel={() => onOpenChange(false)}
          onConfirm={onConfirm}
        />
      </DialogContent>
    </Dialog>
  );
}

type BodyProps = {
  movingFolderId?: string | null;
  /** null = the item is at root level. */
  currentParentId: string | null;
  isPending?: boolean;
  onCancel: () => void;
  onConfirm: (targetFolderId: string | null) => void;
};

function MoveDialogBody({ movingFolderId, currentParentId, isPending, onCancel, onConfirm }: BodyProps) {
  const t = useTranslations();
  // null = root. Starts on the current parent.
  const [selected, setSelected] = useState<string | null>(currentParentId);

  const { folders: allFolders } = useFolders();

  const disabledIds = useMemo(
    () => (movingFolderId ? collectDescendants(movingFolderId, allFolders) : new Set<string>()),
    [movingFolderId, allFolders]
  );

  const roots = allFolders.filter(f => f.parentId === null);

  // Moving to the current parent does nothing, so block it.
  const isNoOp = selected === currentParentId;

  return (
    <>
      <div className="max-h-72 overflow-y-auto border rounded-md">
        <div className="p-1">
          {/* Root entry */}
          <div
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm cursor-pointer select-none',
              selected === null ? 'bg-accent text-accent-foreground font-medium' : 'hover:bg-accent/60 text-foreground'
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
              selected={selected}
              onSelect={setSelected}
              depth={0}
            />
          ))}
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={isPending}>
          {t('common.cancel')}
        </Button>
        <Button size="lg" onClick={() => onConfirm(selected)} disabled={isPending || isNoOp}>
          {t('files.move')}
        </Button>
      </DialogFooter>
    </>
  );
}

type TreeNodeProps = {
  folder: FileTreeFolder;
  all: FileTreeFolder[];
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
        style={{ paddingLeft: `${8 + depth * TREE_INDENT_STEP_PX}px` }}
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

/** Collect a folder's subtree IDs (inclusive) from the flat list. */
function collectDescendants(folderId: string, all: FileTreeFolder[]): Set<string> {
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

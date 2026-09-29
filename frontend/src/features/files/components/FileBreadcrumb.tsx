'use client';

import { ArrowLeft, Check, ChevronRight, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { type FileTreeFolder } from '@/client';
import { InlineRename } from '@/components/shared/InlineRename';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import { folderHref, noteHref, Routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

import { useFileTree } from '../hooks/useFileTree';
import { type ChildrenIndex } from '../lib/fileTree';

// ─── Types ───────────────────────────────────────────────────────────────────

export type FileBreadcrumbCurrent = {
  kind: 'folder' | 'note';
  id: string;
  name: string;
  /** Parent folder ID; null = root level. */
  parentId: string | null;
};

type Props = {
  /** Ancestor chain from root to the direct parent (does NOT include current). */
  path: FileTreeFolder[];
  current: FileBreadcrumbCurrent;
  /** Called with the new trimmed name when the user confirms a rename. */
  onRename?: (name: string) => void;
  /** When true the current item cannot be renamed (e.g. trashed note). */
  renameDisabled?: boolean;
  /** Fallback href for the back arrow when there is no in-app history. */
  fallbackHref?: string;
};

// Collapse when there are more than 3 items in total (path + current).
const COLLAPSE_THRESHOLD = 3;

// ─── SiblingList ─────────────────────────────────────────────────────────────
// Reusable list rendered inside HoverCard content: folders or notes as links.

type SiblingEntry = { id: string; name: string; href: string; isCurrent: boolean };

function SiblingList({ siblings }: { siblings: SiblingEntry[] }) {
  if (siblings.length === 0) return null;
  return (
    <ul className="max-h-60 overflow-y-auto py-0.5">
      {siblings.map(s => (
        <li key={s.id}>
          <Link
            href={s.href}
            className={cn(
              'flex items-center gap-2 rounded-md px-2.5 py-1 text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
              s.isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground'
            )}
          >
            {s.isCurrent && <Check className="size-3 shrink-0" />}
            <span className={cn('truncate max-w-[200px]', !s.isCurrent && 'pl-5')}>{s.name || '—'}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ─── FolderSiblingCard ────────────────────────────────────────────────────────
// HoverCard that lists folders sharing the same parentId.

function FolderSiblingCard({
  parentId,
  currentId,
  childrenIndex,
  children,
}: {
  parentId: string | null;
  currentId: string;
  childrenIndex: ChildrenIndex;
  children: React.ReactNode;
}) {
  // Backend already sorts folders by lower(name); no client-side re-sort needed.
  const siblings: SiblingEntry[] = (childrenIndex.get(parentId)?.folders ?? []).map(f => ({
    id: f.id,
    name: f.name,
    href: folderHref(f),
    isCurrent: f.id === currentId,
  }));

  if (siblings.length === 0) return <>{children}</>;

  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent className="w-auto min-w-[160px] p-0">
        <SiblingList siblings={siblings} />
      </HoverCardContent>
    </HoverCard>
  );
}

// ─── NoteSiblingCard ──────────────────────────────────────────────────────────
// HoverCard that lazy-fetches notes in the same folder when the card opens.

function NoteSiblingCard({
  folderId,
  currentId,
  childrenIndex,
  children,
}: {
  folderId: string | null;
  currentId: string;
  childrenIndex: ChildrenIndex;
  children: React.ReactNode;
}) {
  // Backend sorts notes by lower(title); no client-side re-sort needed.
  // The tree is already in memory, so no extra fetch is required on hover.
  const siblings: SiblingEntry[] = (childrenIndex.get(folderId)?.notes ?? []).map(n => ({
    id: n.id,
    name: n.title || '',
    href: noteHref({ id: n.id, title: n.title }),
    isCurrent: n.id === currentId,
  }));

  const showContent = siblings.length > 0;

  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      {showContent && (
        <HoverCardContent className="w-auto min-w-[160px] p-0">
          <SiblingList siblings={siblings} />
        </HoverCardContent>
      )}
    </HoverCard>
  );
}

// InlineRename is the shared component in @/components/shared/InlineRename.

// ─── CurrentCrumb ─────────────────────────────────────────────────────────────
// The last (current) item — clickable for rename, with a sibling HoverCard.

function CurrentCrumb({
  current,
  childrenIndex,
  onRename,
  renameDisabled,
}: {
  current: FileBreadcrumbCurrent;
  childrenIndex: ChildrenIndex;
  onRename?: (name: string) => void;
  renameDisabled?: boolean;
}) {
  const t = useTranslations();
  const [editing, setEditing] = useState(false);
  const displayName = current.name.trim() || t('notes.untitled');

  function handleRenameRequest() {
    if (!renameDisabled && onRename) setEditing(true);
  }

  function handleSave(newName: string) {
    setEditing(false);
    onRename?.(newName);
  }

  const label = (
    <button
      type="button"
      onClick={handleRenameRequest}
      // Only show pointer cursor when rename is enabled.
      className={cn(
        'rounded px-1.5 py-0.5 text-sm text-foreground transition-colors',
        !renameDisabled && onRename && 'hover:bg-muted cursor-pointer',
        (renameDisabled || !onRename) && 'cursor-default'
      )}
      aria-label={!renameDisabled && onRename ? t('files.rename') : undefined}
    >
      <span className="block max-w-[200px] truncate">{displayName}</span>
    </button>
  );

  if (editing) {
    return (
      <InlineRename
        initialValue={current.name}
        // 100 for folders, 200 for notes (matches backend limits).
        maxLength={current.kind === 'folder' ? 100 : 200}
        onSave={handleSave}
        onCancel={() => setEditing(false)}
      />
    );
  }

  if (current.kind === 'folder') {
    return (
      <FolderSiblingCard parentId={current.parentId} currentId={current.id} childrenIndex={childrenIndex}>
        {label}
      </FolderSiblingCard>
    );
  }

  return (
    <NoteSiblingCard folderId={current.parentId} currentId={current.id} childrenIndex={childrenIndex}>
      {label}
    </NoteSiblingCard>
  );
}

// ─── PathCrumb ────────────────────────────────────────────────────────────────
// An ancestor item — a Link with a sibling folder HoverCard.

function PathCrumb({ folder, childrenIndex }: { folder: FileTreeFolder; childrenIndex: ChildrenIndex }) {
  const link = (
    <Link
      href={folderHref(folder)}
      className="rounded px-1.5 py-0.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <span className="block max-w-[180px] truncate">{folder.name}</span>
    </Link>
  );

  return (
    <FolderSiblingCard parentId={folder.parentId} currentId={folder.id} childrenIndex={childrenIndex}>
      {link}
    </FolderSiblingCard>
  );
}

// ─── CollapsedCrumbs ─────────────────────────────────────────────────────────
// The `…` button that shows hidden middle items in a dropdown.

function CollapsedCrumbs({ hidden }: { hidden: FileTreeFolder[] }) {
  const t = useTranslations();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('files.show_hidden_folders')}
          className="rounded px-1.5 py-0.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {hidden.map(f => (
          <DropdownMenuItem key={f.id} asChild>
            <Link href={folderHref(f)}>{f.name}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Separator ───────────────────────────────────────────────────────────────

function Sep() {
  return <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />;
}

// ─── FileBreadcrumb ───────────────────────────────────────────────────────────

export function FileBreadcrumb({ path, current, onRename, renameDisabled, fallbackHref }: Props) {
  const t = useTranslations();

  // Compute the fallback for the back arrow: parent folder href or /files root.
  const parentFolder = path.length > 0 ? path[path.length - 1] : null;
  const backFallback = fallbackHref ?? (parentFolder ? folderHref(parentFolder) : Routes.FILES);
  const goBack = useBackNavigation(backFallback);

  // Full tree — already in memory when the files page has loaded.
  // Using the tree's childrenIndex lets sibling cards avoid a second round trip.
  const { childrenIndex } = useFileTree();

  // Collapse when path + current exceeds the threshold.
  const totalItems = path.length + 1; // +1 for current
  const collapsed = totalItems > COLLAPSE_THRESHOLD;

  // When collapsed: [first, ...hidden, lastParent, current]
  const firstItem = path[0] ?? null;
  const lastParent = path.length > 1 ? path[path.length - 1] : null;
  const hiddenItems = collapsed ? path.slice(1, path.length - 1) : [];

  return (
    <nav aria-label={t('files.breadcrumb_label')} className="flex min-w-0 items-center gap-1">
      {/* Back arrow — visible on all screen sizes */}
      <button
        type="button"
        onClick={goBack}
        aria-label={t('common.back')}
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
      >
        <ArrowLeft className="size-4" />
      </button>

      {/* Mobile: the full path does not fit, so show only the current name. */}
      <span className="min-w-0 truncate px-1.5 text-sm text-foreground lg:hidden">
        {current.name.trim() || t('notes.untitled')}
      </span>

      {/* Breadcrumb items — hidden on mobile */}
      <div className="hidden lg:flex items-center gap-0.5">
        {!collapsed ? (
          // Full path
          <>
            {path.map((folder, i) => (
              <span key={folder.id} className="flex items-center gap-0.5">
                {i > 0 && <Sep />}
                <PathCrumb folder={folder} childrenIndex={childrenIndex} />
              </span>
            ))}
            {path.length > 0 && <Sep />}
            <CurrentCrumb
              current={current}
              childrenIndex={childrenIndex}
              onRename={onRename}
              renameDisabled={renameDisabled}
            />
          </>
        ) : (
          // Collapsed: first > … > lastParent > current
          <>
            {firstItem && (
              <>
                <PathCrumb folder={firstItem} childrenIndex={childrenIndex} />
                <Sep />
              </>
            )}
            {hiddenItems.length > 0 && (
              <>
                <CollapsedCrumbs hidden={hiddenItems} />
                <Sep />
              </>
            )}
            {lastParent && (
              <>
                <PathCrumb folder={lastParent} childrenIndex={childrenIndex} />
                <Sep />
              </>
            )}
            <CurrentCrumb
              current={current}
              childrenIndex={childrenIndex}
              onRename={onRename}
              renameDisabled={renameDisabled}
            />
          </>
        )}
      </div>
    </nav>
  );
}

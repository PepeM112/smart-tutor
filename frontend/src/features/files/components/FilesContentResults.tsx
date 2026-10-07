'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, NotepadText } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { sdk } from '@/lib/apiClient';
import { displayTitle } from '@/lib/displayTitle';
import { noteHref } from '@/lib/routes';

import { useFileTree } from '../hooks/useFileTree';
import { buildFolderPath } from '../hooks/useFolderPath';
import { fileQueryKeys } from '../lib/queryKeys';

/** The API needs at least this many characters. */
const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 300;

type Props = {
  /** The search text as typed. */
  query: string;
  /** The folder of the view (null = root). The search covers its subtree. */
  folderId: string | null;
};

/**
 * "Found in content": notes whose text matches the search, below the tree.
 * It is a separate list, so a late response never moves the tree rows. Only the content is searched, so a
 * note can be in the tree (title) and here (content). The query key holds the text, so a new text cancels
 * and replaces the old request.
 */
export function FilesContentResults({ query, folderId }: Props) {
  const t = useTranslations();
  const { folders } = useFileTree();

  const trimmed = query.trim();
  const debounced = useDebouncedValue(trimmed, DEBOUNCE_MS);
  const isLongEnough = debounced.length >= MIN_QUERY_LENGTH && trimmed.length >= MIN_QUERY_LENGTH;

  const {
    data: res,
    isFetching,
    isError,
  } = useQuery({
    queryKey: fileQueryKeys.noteSearch(folderId, debounced),
    queryFn: ({ signal }) =>
      sdk.notesSearchContent({ query: { q: debounced, folder_id: folderId ?? undefined }, signal }),
    enabled: isLongEnough,
  });

  if (trimmed.length < MIN_QUERY_LENGTH) return null;

  // Waiting for the debounce also counts as searching.
  const isSearching = trimmed !== debounced || isFetching;
  // During the debounce `res` still holds the data of the previous text, so show it only for the current text.
  const matches = isLongEnough && trimmed === debounced ? (res?.data ?? []) : [];
  const hasError = isError && trimmed === debounced;

  if (!isSearching && !hasError && matches.length === 0) return null;

  const pathLabel = (matchFolderId: string | null): string =>
    [t('files.title'), ...buildFolderPath(matchFolderId, folders).map(folder => folder.name)].join(' / ');

  return (
    <section aria-label={t('files.found_in_content')} className="mt-4 border-t border-border px-2 pt-3 pb-4">
      <h2 className="mb-1 text-xs font-medium text-muted-foreground">{t('files.found_in_content')}</h2>
      {isSearching && (
        <p className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {t('files.searching_content')}
        </p>
      )}
      {hasError && <p className="py-1 text-sm text-muted-foreground">{t('files.search_content_failed')}</p>}
      <ul>
        {matches.map(match => (
          <li key={match.id}>
            <Link
              href={noteHref({ id: match.id, title: match.title })}
              className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent/30"
            >
              <NotepadText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{displayTitle(match.title, t)}</span>
                  <span className="truncate text-xs text-muted-foreground">{pathLabel(match.folderId)}</span>
                </span>
                <span className="line-clamp-2 text-xs text-muted-foreground">
                  <HighlightedText text={match.snippet} needle={trimmed} />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** `text` with each case-insensitive hit of `needle` in medium weight. The snippet is plain text (the API strips markdown). */
function HighlightedText({ text, needle }: { text: string; needle: string }) {
  if (!needle) return text;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // A capture group keeps the hits in the split result, at the odd indexes.
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="bg-transparent font-medium text-foreground">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

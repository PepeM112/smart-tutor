import { useCallback, useState } from 'react';

type RowPreview<T> = {
  /** The previewed row, or null. Only a row that is in `items` right now counts. */
  previewItem: T | null;
  previewId: string | null;
  openPreview: (id: string) => void;
  closePreview: () => void;
};

type Saved = { id: string | null; key: string };

/**
 * State of the preview pane of a list page. The pane shows `previewItem`.
 *
 * The saved id is cleared at once when the row leaves `items` (delete, loading) or when `resetKey` changes.
 * Only hiding the pane would keep the id, and the pane would open again when the row came back.
 * `resetKey` is a string that changes with the view: page, sort, filters (for Files: the folder).
 * It is a key and not a callback, because the page creates this hook after the query that reads the sort.
 */
export function useRowPreview<T extends { id: string }>(items: readonly T[], resetKey = ''): RowPreview<T> {
  const [saved, setSaved] = useState<Saved>({ id: null, key: resetKey });
  const savedId = saved.key === resetKey ? saved.id : null;
  const previewItem = savedId === null ? null : (items.find(item => item.id === savedId) ?? null);

  // Set state during render: React re-renders at once, so there is no frame with a stale id.
  if (saved.id !== null && previewItem === null) setSaved({ id: null, key: resetKey });

  const openPreview = useCallback((id: string) => setSaved({ id, key: resetKey }), [resetKey]);
  const closePreview = useCallback(() => setSaved(prev => ({ ...prev, id: null })), []);

  return { previewItem, previewId: previewItem?.id ?? null, openPreview, closePreview };
}

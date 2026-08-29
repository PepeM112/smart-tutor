import { useCallback, useState } from 'react';

/**
 * Manages the ordered array of block-level items (questions/groups) shared by the
 * test editor and the AI-generated test preview. Both screens append, replace, and
 * remove items by index — this hook centralizes that array bookkeeping so the two
 * screens read the same way and don't drift out of sync.
 *
 * `setItems` is returned as-is (not wrapped) so callers can still perform bespoke
 * full-array replacements (e.g. merging an AI edit result, resetting to the
 * originally generated questions) without the hook needing to know about those
 * feature-specific shapes.
 */
export function useQuestionBlockList<T>(initialItems: T[] | (() => T[]) = []) {
  const [items, setItems] = useState<T[]>(initialItems);

  const addItem = useCallback((item: T) => {
    setItems(prev => [...prev, item]);
  }, []);

  const updateItem = useCallback((index: number, item: T) => {
    setItems(prev => prev.map((existing, i) => (i === index ? item : existing)));
  }, []);

  const removeItem = useCallback((index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  }, []);

  return { items, setItems, addItem, updateItem, removeItem };
}

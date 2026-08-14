import { useCallback, useState } from 'react';

const INTERACTIVE_SELECTOR = 'input, textarea, button, select, [role="checkbox"], [data-slot="switch"]';

export function useBlockSelection() {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  const toggleSelection = useCallback((index: number, e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest(INTERACTIVE_SELECTOR)) return;

    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const removeAndReindex = useCallback((index: number) => {
    setSelectedIndices(prev => {
      const next = new Set<number>();
      prev.forEach(i => {
        if (i === index) return;
        next.add(i > index ? i - 1 : i);
      });
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIndices(new Set());
  }, []);

  return { selectedIndices, toggleSelection, removeAndReindex, clearSelection };
}

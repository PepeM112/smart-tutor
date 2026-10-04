'use client';

import { createContext, useContext } from 'react';

import { type TrashTarget } from '../hooks/useTrashMutations';

export type TrashTableContextValue = {
  restoreItem: (target: TrashTarget) => void;
  hardDeleteItem: (target: TrashTarget) => void;
  /** True while any trash mutation runs. All rows share it, so no two actions run at once. */
  isBusy: boolean;
  /** The clock for relative times. One `useNow` for the table, not one timer per row. */
  now: Date;
};

/** What every Trash row needs, so rows get only their own item and depth as props. */
export const TrashTableContext = createContext<TrashTableContextValue | null>(null);

export function useTrashTable(): TrashTableContextValue {
  const value = useContext(TrashTableContext);
  if (!value) throw new Error('useTrashTable must be used inside <TrashTableContext.Provider>');
  return value;
}

import { type ReactNode, type SyntheticEvent } from 'react';

/**
 * Stops events at the actions cell, so they do not reach the row.
 * The dialogs render in a portal, but React still sends their events up the React tree:
 * without this, a click in a dialog would also toggle the folder or open the note,
 * and a pointer down or Enter would start a row drag.
 */
export function RowEventBoundary({ children }: { children: ReactNode }) {
  const stop = (e: SyntheticEvent) => e.stopPropagation();
  return (
    <div className="contents" onClick={stop} onPointerDown={stop} onKeyDown={stop}>
      {children}
    </div>
  );
}

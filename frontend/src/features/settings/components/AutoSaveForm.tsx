import type { ReactNode } from 'react';

/** Wraps one auto-saving input so that Enter saves, like a blur does. */
export function AutoSaveForm({ onSave, children }: { onSave: () => void; children: ReactNode }) {
  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        onSave();
      }}
    >
      {children}
    </form>
  );
}

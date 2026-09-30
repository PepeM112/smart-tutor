'use client';

import { useState } from 'react';

type Props = {
  initialValue: string;
  /** Use `NAME_LIMITS` from `@/lib/limits`. */
  maxLength: number;
  /** Called with the trimmed, changed name when the user commits. */
  onSave: (value: string) => void;
  onCancel: () => void;
};

/**
 * A raw text input that auto-focuses and selects all on mount.
 * Enter/blur commits (only if trimmed non-empty and different from initialValue), Esc cancels.
 * Used in FileBreadcrumb (current-crumb rename) and FileTreeRow (table inline rename).
 */
export function InlineRename({ initialValue, maxLength, onSave, onCancel }: Props) {
  const [value, setValue] = useState(initialValue);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }

  function commit() {
    const trimmed = value.trim();
    if (trimmed && trimmed !== initialValue) {
      onSave(trimmed);
    } else {
      onCancel();
    }
  }

  return (
    <input
      autoFocus
      maxLength={maxLength}
      value={value}
      onChange={e => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={commit}
      // Select all so the user can immediately type the replacement name.
      onFocus={e => e.target.select()}
      className="rounded border border-input bg-background px-1 py-0.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
      style={{ width: `${Math.max(80, value.length * 7)}px`, maxWidth: '200px', minWidth: '80px' }}
    />
  );
}

'use client';

// Notion-style tag row: plain pills (no outlined field) + a ghost "Add tag" button
// that turns into a borderless inline input. Enter or "," adds; Esc or blur closes.

import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type KeyboardEvent } from 'react';

// Same limits as the backend (`NOTE_MAX_TAGS`, `NOTE_TAG_MAX_CHARS` in `schemas/note.py`).
// Autosave does not retry a 422, so the UI must not let the user go over them.
const MAX_TAGS = 10;
const MAX_TAG_CHARS = 25;

type Props = {
  tags: string[];
  onChange: (tags: string[]) => void;
};

export function TagInput({ tags, onChange }: Props) {
  const t = useTranslations('notes');
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');
  const isFull = tags.length >= MAX_TAGS;

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase();
    setInput('');
    if (!tag || tags.includes(tag) || isFull) return;
    onChange([...tags, tag]);
    // The 10th tag closes the input: the "Add tag" button is hidden while the row is full.
    if (tags.length + 1 >= MAX_TAGS) setEditing(false);
  }

  function removeTag(tag: string) {
    onChange(tags.filter(existing => existing !== tag));
  }

  function close() {
    addTag(input);
    setEditing(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
    }
    if (e.key === 'Escape') {
      setInput('');
      setEditing(false);
    }
    if (e.key === 'Backspace' && !input && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div data-slot="tag-input" className="flex flex-wrap items-center gap-1.5 min-h-7">
      {tags.map(tag => (
        <span
          key={tag}
          className="group inline-flex h-6 items-center gap-0.5 rounded-md bg-muted pl-2 pr-1 text-xs font-medium text-foreground/80"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="flex size-4 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/10 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
            aria-label={t('remove_tag', { tag })}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}

      {editing ? (
        <input
          autoFocus
          maxLength={MAX_TAG_CHARS}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={close}
          placeholder={t('add_tag')}
          className="h-6 w-28 bg-transparent px-1 text-xs text-foreground outline-none placeholder:text-muted-foreground/60"
        />
      ) : isFull ? null : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
        >
          <Plus className="size-3" />
          {t('add_tag')}
        </button>
      )}
    </div>
  );
}

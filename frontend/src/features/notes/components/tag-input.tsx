'use client';

import { X } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';

import { Input } from '@/components/ui/input';

type Props = {
  tags: string[];
  onChange: (tags: string[]) => void;
};

export function TagInput({ tags, onChange }: Props) {
  const [input, setInput] = useState('');

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase();
    if (!tag || tags.includes(tag)) return;
    onChange([...tags, tag]);
    setInput('');
  }

  function removeTag(tag: string) {
    onChange(tags.filter(t => t !== tag));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
    }
    if (e.key === 'Backspace' && !input && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 w-64 max-w-full rounded-md border border-input px-2 py-1 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
      {tags.map(tag => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="text-muted-foreground/60 hover:text-foreground"
            aria-label={`Remove tag ${tag}`}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <Input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={tags.length === 0 ? 'Add tags...' : ''}
        className="flex-1 min-w-16 border-0 px-0 py-0 h-6 text-xs shadow-none bg-transparent dark:bg-transparent focus-visible:ring-0 focus-visible:border-transparent"
      />
    </div>
  );
}

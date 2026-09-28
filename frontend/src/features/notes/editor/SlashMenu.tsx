'use client';

// Slash command menu for the rich note editor.
//
// "/" opens a filterable block-type picker. Keyboard navigation:
//   ↑ / ↓  — move selection
//   Enter   — execute selected command
//   Esc     — close and keep the "/"
//
// Architecture:
//   SlashMenuExtension — Tiptap Extension wrapping @tiptap/suggestion.
//   SlashMenuPopup     — React component rendered via ReactRenderer.
//     The popup renders into document.body (outside the React tree), so
//     next-intl context is unavailable. Translated labels are passed via
//     extension options from RichNoteEditor (which can call useTranslations).

import { Extension } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import { Suggestion } from '@tiptap/suggestion';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

import { cn } from '@/lib/utils';

import type { Editor, Range } from '@tiptap/core';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';

// ─── Slash command items ─────────────────────────────────────────────────────

export type SlashItem = {
  labelKey: string;
  /** English fallback + filter text. */
  label: string;
  /** Translated display label (set at extension configure time). */
  displayLabel: string;
  icon: string;
  execute: (props: { editor: Editor; range: Range }) => void;
};

/** Base item definitions — `displayLabel` is filled from extension options at runtime. */
const BASE_ITEMS: Omit<SlashItem, 'displayLabel'>[] = [
  {
    labelKey: 'slash_text',
    label: 'Text',
    icon: '¶',
    execute: ({ editor, range }) => editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    labelKey: 'slash_h1',
    label: 'Heading 1',
    icon: 'H1',
    execute: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run(),
  },
  {
    labelKey: 'slash_h2',
    label: 'Heading 2',
    icon: 'H2',
    execute: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run(),
  },
  {
    labelKey: 'slash_h3',
    label: 'Heading 3',
    icon: 'H3',
    execute: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run(),
  },
  {
    labelKey: 'slash_bullet',
    label: 'Bullet list',
    icon: '•',
    execute: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    labelKey: 'slash_ordered',
    label: 'Numbered list',
    icon: '1.',
    execute: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    labelKey: 'slash_todo',
    label: 'To-do list',
    icon: '☐',
    execute: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    labelKey: 'slash_quote',
    label: 'Quote',
    icon: '"',
    execute: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    labelKey: 'slash_code',
    label: 'Code block',
    icon: '</>',
    execute: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    labelKey: 'slash_divider',
    label: 'Divider',
    icon: '—',
    execute: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    labelKey: 'slash_table',
    label: 'Table',
    icon: '⊞',
    execute: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
];

// ─── SlashMenuPopup component ────────────────────────────────────────────────

export type SlashMenuPopupHandle = {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
};

type SlashMenuPopupProps = SuggestionProps<SlashItem> & { hint: string };

export const SlashMenuPopup = forwardRef<SlashMenuPopupHandle, SlashMenuPopupProps>(
  function SlashMenuPopup(props, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
      setSelectedIndex(0);
    }, [props.items]);

    const execute = (item: SlashItem) => {
      props.command(item);
    };

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: SuggestionKeyDownProps): boolean => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex(i => (i - 1 + props.items.length) % props.items.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex(i => (i + 1) % props.items.length);
          return true;
        }
        if (event.key === 'Enter') {
          const item = props.items[selectedIndex];
          if (item) execute(item);
          return true;
        }
        return false;
      },
    }));

    if (props.items.length === 0) return null;

    return (
      <div data-slot="slash-menu" className="min-w-48 rounded-lg border border-border bg-background p-1 shadow-md">
        {props.items.map((item, index) => (
          <button
            key={item.labelKey}
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={() => execute(item)}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-75',
              index === selectedIndex ? 'bg-muted text-foreground' : 'text-foreground/80 hover:bg-muted/60'
            )}
          >
            <span className="w-6 shrink-0 text-center text-xs font-mono text-muted-foreground">{item.icon}</span>
            <span className="font-medium">{item.displayLabel}</span>
          </button>
        ))}
        <div className="mt-0.5 border-t border-border px-2 pt-1 pb-0.5 text-[10px] text-muted-foreground">
          {props.hint}
        </div>
      </div>
    );
  }
);

// ─── Tiptap Extension ────────────────────────────────────────────────────────

export type SlashMenuOptions = {
  /** Translated labels keyed by labelKey (e.g. slash_text → "Texto"). Falls back to English label. */
  translations: Record<string, string>;
  /** Translated footer hint. */
  hint: string;
};

export const DEFAULT_SLASH_HINT = 'Type to filter · ↑↓ to navigate · Enter to insert · Esc to close';

// eslint-disable-next-line react-refresh/only-export-components -- intentional: extension + popup are co-located by design.
export const SlashMenuExtension = Extension.create<SlashMenuOptions>({
  name: 'slashMenu',

  addOptions() {
    return { translations: {}, hint: DEFAULT_SLASH_HINT };
  },

  addProseMirrorPlugins() {
    const { translations, hint } = this.options;
    const SLASH_ITEMS: SlashItem[] = BASE_ITEMS.map(item => ({
      ...item,
      displayLabel: translations[item.labelKey] ?? item.label,
    }));

    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        char: '/',
        allowSpaces: false,
        startOfLine: false,
        // "/" is normal text in code (paths, comments, division).
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          const inCodeBlock = $from.parent.type.spec.code === true;
          const inInlineCode = $from.marks().some(mark => mark.type.spec.code === true);
          return !inCodeBlock && !inInlineCode;
        },

        items: ({ query }: { query: string }) => {
          const q = query.toLowerCase();
          // Match the English label too, so "/head" works in every locale.
          return q
            ? SLASH_ITEMS.filter(
                item => item.label.toLowerCase().includes(q) || item.displayLabel.toLowerCase().includes(q)
              )
            : SLASH_ITEMS;
        },

        command: ({ editor, range, props: item }) => {
          // SAFETY: Suggestion<SlashItem> guarantees props is SlashItem.
          (item as SlashItem).execute({ editor, range });
        },

        render: () => {
          let renderer: ReactRenderer<SlashMenuPopupHandle, SlashMenuPopupProps> | null = null;
          let popup: HTMLElement | null = null;

          const position = (clientRect: (() => DOMRect | null) | null) => {
            if (!popup || !clientRect) return;
            const rect = clientRect();
            if (!rect) return;
            const menuHeight = popup.offsetHeight || 280;
            // The visual viewport excludes the on-screen keyboard; `innerHeight` does not,
            // so on a phone the menu could open under the keyboard.
            const vv = window.visualViewport;
            const viewportBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
            const viewportRight = vv ? vv.offsetLeft + vv.width : window.innerWidth;
            const spaceBelow = viewportBottom - rect.bottom;
            const above = spaceBelow < menuHeight + 16;
            popup.style.position = 'fixed';
            // Keep the menu inside narrow screens.
            popup.style.left = `${Math.max(8, Math.min(rect.left, viewportRight - popup.offsetWidth - 8))}px`;
            popup.style.top = above ? `${rect.top - menuHeight - 4}px` : `${rect.bottom + 4}px`;
            popup.style.zIndex = '9999';
          };

          return {
            onStart: (props: SuggestionProps<SlashItem>) => {
              popup = document.createElement('div');
              document.body.appendChild(popup);
              renderer = new ReactRenderer(SlashMenuPopup, { props: { ...props, hint }, editor: props.editor });
              popup.appendChild(renderer.element);
              position(props.clientRect ?? null);
            },

            onUpdate: (props: SuggestionProps<SlashItem>) => {
              renderer?.updateProps({ ...props, hint });
              position(props.clientRect ?? null);
            },

            onExit: () => {
              renderer?.destroy();
              popup?.remove();
              renderer = null;
              popup = null;
            },

            onKeyDown: (props: SuggestionKeyDownProps): boolean => {
              if (props.event.key === 'Escape') {
                renderer?.destroy();
                popup?.remove();
                renderer = null;
                popup = null;
                return true;
              }
              return renderer?.ref?.onKeyDown(props) ?? false;
            },
          };
        },
      }),
    ];
  },
});

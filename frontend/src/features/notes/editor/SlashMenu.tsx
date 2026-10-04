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
//     ReactRenderer renders through a portal of the editor content, so the popup is inside the
//     React tree (next-intl context works) even though its DOM element is moved to document.body.
//     It translates the labels and filters the items (the extension has no translations).

import { Extension } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import { Suggestion } from '@tiptap/suggestion';
import { useTranslations } from 'next-intl';
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';

import { cn } from '@/lib/utils';

import type { Editor, Range } from '@tiptap/core';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';

// ─── Slash command items ─────────────────────────────────────────────────────

type SlashItem = {
  /** Key of the label in the `notes` messages. */
  labelKey: string;
  /** English label. Also matched by the filter, so "/head" works in every locale. */
  label: string;
  icon: string;
  execute: (props: { editor: Editor; range: Range }) => void;
};

const SLASH_ITEMS: SlashItem[] = [
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
    labelKey: 'slash_callout',
    label: 'Callout',
    icon: 'ⓘ',
    execute: ({ editor, range }) => editor.chain().focus().deleteRange(range).setCallout('note').run(),
  },
  {
    labelKey: 'slash_toggle',
    label: 'Toggle',
    icon: '▸',
    execute: ({ editor, range }) => editor.chain().focus().deleteRange(range).insertToggle().run(),
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

type SlashMenuPopupProps = SuggestionProps<SlashItem> & { ref?: Ref<SlashMenuPopupHandle> };

export function SlashMenuPopup({ ref, ...props }: SlashMenuPopupProps) {
  const t = useTranslations('notes');
  // The choice belongs to one query: a new query starts at the first item (no effect needed to reset it).
  const [choice, setChoice] = useState({ query: '', index: 0 });
  const listRef = useRef<HTMLDivElement>(null);

  const query = props.query.toLowerCase();
  const items = query
    ? props.items.filter(
        item => item.label.toLowerCase().includes(query) || t(item.labelKey).toLowerCase().includes(query)
      )
    : props.items;

  const selectedIndex = choice.query === props.query ? choice.index : 0;
  const setSelectedIndex = (update: (index: number) => number) =>
    setChoice({ query: props.query, index: update(selectedIndex) });

  const execute = (item: SlashItem) => {
    props.command(item);
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: SuggestionKeyDownProps): boolean => {
      // No item matches: the popup shows nothing, so the keys go to the editor (`% 0` would give `NaN`).
      if (items.length === 0) return false;
      if (event.key === 'ArrowUp') {
        setSelectedIndex(i => (i - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex(i => (i + 1) % items.length);
        return true;
      }
      if (event.key === 'Enter') {
        const item = items[selectedIndex];
        if (item) execute(item);
        return true;
      }
      return false;
    },
  }));

  // The list scrolls on short screens: keep the item chosen with the arrow keys visible.
  useEffect(() => {
    listRef.current?.children[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (items.length === 0) return null;

  return (
    <div
      ref={listRef}
      data-slot="slash-menu"
      className="max-h-[min(20rem,50dvh)] min-w-48 overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground ring-1 ring-foreground/10"
    >
      {items.map((item, index) => (
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
          <span className="font-medium">{t(item.labelKey)}</span>
        </button>
      ))}
      <div className="mt-0.5 border-t border-foreground/10 px-2 pt-1 pb-0.5 text-[10px] text-muted-foreground">
        {t('slash_menu_hint')}
      </div>
    </div>
  );
}

// ─── Tiptap Extension ────────────────────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components -- intentional: extension + popup are co-located by design.
export const SlashMenuExtension = Extension.create({
  name: 'slashMenu',

  addProseMirrorPlugins() {
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

        // The popup filters them: only it has the translated labels.
        items: () => SLASH_ITEMS,

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
            const viewportTop = vv ? vv.offsetTop : 0;
            const viewportBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
            const viewportRight = vv ? vv.offsetLeft + vv.width : window.innerWidth;
            const spaceBelow = viewportBottom - rect.bottom;
            const above = spaceBelow < menuHeight + 16;
            popup.style.position = 'fixed';
            // Keep the menu inside narrow screens.
            popup.style.left = `${Math.max(8, Math.min(rect.left, viewportRight - popup.offsetWidth - 8))}px`;
            // Above the caret, keep the top edge on screen (a caret near the top of a short screen).
            popup.style.top = above
              ? `${Math.max(viewportTop + 8, rect.top - menuHeight - 4)}px`
              : `${rect.bottom + 4}px`;
            popup.style.zIndex = '9999';
          };

          return {
            onStart: (props: SuggestionProps<SlashItem>) => {
              popup = document.createElement('div');
              document.body.appendChild(popup);
              renderer = new ReactRenderer(SlashMenuPopup, { props, editor: props.editor });
              popup.appendChild(renderer.element);
              position(props.clientRect ?? null);
            },

            onUpdate: (props: SuggestionProps<SlashItem>) => {
              renderer?.updateProps(props);
              position(props.clientRect ?? null);
            },

            onExit: () => {
              renderer?.destroy();
              popup?.remove();
              renderer = null;
              popup = null;
            },

            // Escape is handled by the suggestion plugin: it exits, and `onExit` cleans up.
            onKeyDown: (props: SuggestionKeyDownProps): boolean => renderer?.ref?.onKeyDown(props) ?? false,
          };
        },
      }),
    ];
  },
});

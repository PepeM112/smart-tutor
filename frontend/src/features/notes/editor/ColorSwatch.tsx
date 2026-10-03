import type { NoteColor } from './noteColor';

/** "A" glyph in the given text color on the given background, as Notion does. */
export function ColorSwatch({ color, bg }: { color: NoteColor | null; bg: NoteColor | null }) {
  return (
    <span
      className="flex size-5 items-center justify-center rounded text-[13px] font-semibold leading-none"
      style={{
        color: color ? `var(--note-${color})` : undefined,
        background: bg ? `var(--note-${bg}-bg)` : undefined,
        boxShadow: bg ? undefined : 'inset 0 0 0 1px var(--border)',
      }}
    >
      A
    </span>
  );
}

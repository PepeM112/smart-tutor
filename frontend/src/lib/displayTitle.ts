type Translate = (key: 'notes.untitled') => string;

/**
 * The title to show for a note or folder. A new note has an empty title:
 * the UI shows "Untitled" then, and the empty string stays in the data.
 */
export function displayTitle(title: string | null | undefined, t: Translate): string {
  return title?.trim() || t('notes.untitled');
}

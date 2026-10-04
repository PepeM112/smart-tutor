const FALLBACK_FILE_NAME = 'note';

/** File name for a note download. Only characters that file systems reject are removed, so "Café" stays "Café". */
export function noteFileName(title: string): string {
  // \p{Cc} = control characters.
  const base = title.replace(/[\\/:*?"<>|\p{Cc}]/gu, '').trim();
  return `${base || FALLBACK_FILE_NAME}.md`;
}

/** Download a note as a Markdown file. */
export function exportNote(title: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = noteFileName(title);
  a.click();
  // Revoke later: some browsers start the download after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

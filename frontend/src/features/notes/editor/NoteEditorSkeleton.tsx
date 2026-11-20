// Shown while the editor chunk loads. Same minimum height as the editor, so the page does not jump.
export function NoteEditorSkeleton() {
  return (
    <div role="status" aria-busy className="min-h-30 animate-pulse space-y-3 py-1">
      <div className="h-4 w-3/4 rounded bg-muted" />
      <div className="h-4 w-full rounded bg-muted" />
      <div className="h-4 w-5/6 rounded bg-muted" />
    </div>
  );
}

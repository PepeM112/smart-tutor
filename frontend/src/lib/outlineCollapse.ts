/** The reading column must stay at least this wide (px). Below it, Ask AI pushes the outline away. */
const MIN_READING_WIDTH = 600;

/** The gap between the main sheet and the Ask AI sheet (px). It belongs to neither width. */
const SHEET_GAP = 12;

/**
 * True when opening Ask AI would leave the reading column under `MIN_READING_WIDTH`.
 * `groupWidth` is the area of both sheets. The reading column is what the outline and the Ask AI sheet leave.
 */
export function shouldCollapseOutline(groupWidth: number, assistWidth: number, outlineWidth: number): boolean {
  return groupWidth - assistWidth - SHEET_GAP - outlineWidth < MIN_READING_WIDTH;
}

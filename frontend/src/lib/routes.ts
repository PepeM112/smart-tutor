export const Routes = {
  LOGIN: '/login',
  SIGNUP: '/signup',

  DASHBOARD: '/dashboard',
  REVIEW: '/review',
  PRACTICE: '/practice',

  TESTS: '/tests',
  TEST_NEW: '/tests/new',
  TEST_EDIT: (id: string) => `/tests/${id}/edit`,
  TEST_DETAIL: (id: string) => `/tests/${id}`,

  NOTE_DETAIL: (id: string) => `/notes/${id}`,

  FILES: '/files',

  QUESTIONS: '/questions',
  QUESTION_NEW: '/questions/new',
  QUESTION_EDIT: (id: string) => `/questions/${id}/edit`,

  HISTORY: '/history',
  RESULT_DETAIL: (id: string) => `/history/${id}`,
  STATS: '/stats',

  TRASH: '/trash',

  COURSES: '/courses',
  COURSE_JOIN: (code: string) => `/courses/join/${code}`,

  SETTINGS: '/settings',

  SANDBOX: '/sandbox',
} as const;

// ─── slug URL helpers ─────────────────────────────────────────────────────────

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
const MAX_SLUG_LENGTH = 60;

/**
 * Build a canonical note URL: `/notes/<slug>-<id>`.
 * The slug is decorative (stripped of diacritics, lowercased, max 60 chars).
 */
export function noteHref(note: { id: string; title: string }): string {
  return `/notes/${buildSlug(note.title)}-${note.id}`;
}

/**
 * Build a canonical folder URL: `/files/<slug>-<id>`.
 */
export function folderHref(folder: { id: string; name: string }): string {
  return `/files/${buildSlug(folder.name)}-${folder.id}`;
}

/**
 * Build a canonical course URL: `/courses/<slug>-<id>`.
 */
export function courseHref(course: { id: string; title: string }): string {
  return `/courses/${buildSlug(course.title)}-${course.id}`;
}

/** The settings sub-page of a course (owner only). */
export function courseSettingsHref(course: { id: string; title: string }): string {
  return `${courseHref(course)}/settings`;
}

/** The page of one attempt on a TEST item of a course. The item id is known before the attempt id. */
export function courseAttemptHref(course: { id: string; title: string }, itemId: string): string {
  return `${courseHref(course)}/tests/${itemId}`;
}

/** Query param of the course page that selects one item (the row is marked, and a note opens in the preview). */
export const COURSE_ITEM_PARAM = 'item';

/** The course page with one item selected. */
export function courseItemHref(course: { id: string; title: string }, itemId: string): string {
  return `${courseHref(course)}?${COURSE_ITEM_PARAM}=${encodeURIComponent(itemId)}`;
}

const COURSE_ATTEMPT_ROUTE_RE = /^\/courses\/([^/?#]+)\/tests\/([^/?#]+)\/?(?:[?#].*)?$/;

/**
 * If `route` is the attempt page of a course test (`/courses/{id}/tests/{itemId}`), the course page
 * with that item selected. Else null. The Assistant uses it, so it never opens an attempt page itself.
 */
export function courseItemRouteForAttempt(route: string): string | null {
  const match = COURSE_ATTEMPT_ROUTE_RE.exec(route);
  return match ? `/courses/${match[1]}?${COURSE_ITEM_PARAM}=${encodeURIComponent(match[2])}` : null;
}

/**
 * Extract the ID from a URL segment of a note or a folder. The segment can be:
 *   - A bare ULID: `01J9XYZ…`
 *   - A slug-prefixed ULID: `my-note-title-01J9XYZ…`
 *
 * Returns the last 26 chars when they match the ULID alphabet; otherwise
 * returns the param unchanged (handles legacy numeric IDs, if any).
 */
export function parseSlugId(param: string): string {
  const candidate = param.slice(-26);
  return ULID_RE.test(candidate) ? candidate : param;
}

function buildSlug(title: string): string {
  return (
    title
      // Decompose characters and strip combining marks (diacritics).
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      // Replace non-alphanumeric runs with a single dash.
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, MAX_SLUG_LENGTH)
      // Trim trailing dash that may appear after slicing.
      .replace(/-$/, '') || 'untitled'
  );
}

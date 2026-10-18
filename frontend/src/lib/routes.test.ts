import { describe, expect, it } from 'vitest';

import {
  classroomItemHref,
  courseItemRouteForAttempt,
  folderHref,
  noteHref,
  parseSlugId,
  spaceIdFromRoute,
} from './routes';

// 26-char Crockford base32 ULID (valid alphabet: 0-9, A-Z minus I, L, O, U)
const ULID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

describe('noteHref', () => {
  it('produces slug-id URL', () => {
    expect(noteHref({ id: ULID, title: 'My Study Note' })).toBe(`/notes/my-study-note-${ULID}`);
  });

  it('strips diacritics', () => {
    expect(noteHref({ id: ULID, title: 'Ação de Graças' })).toBe(`/notes/acao-de-gracas-${ULID}`);
  });

  it('collapses non-alphanumeric runs to single dash', () => {
    expect(noteHref({ id: ULID, title: 'C++ & Design Patterns' })).toBe(`/notes/c-design-patterns-${ULID}`);
  });

  it('truncates slug to 60 chars', () => {
    const long = 'a'.repeat(80);
    const href = noteHref({ id: ULID, title: long });
    const slug = href.replace(`/notes/`, '').replace(`-${ULID}`, '');
    expect(slug.length).toBeLessThanOrEqual(60);
  });

  it('falls back to "untitled" for empty title', () => {
    expect(noteHref({ id: ULID, title: '' })).toBe(`/notes/untitled-${ULID}`);
  });

  it('falls back to "untitled" for whitespace-only title', () => {
    expect(noteHref({ id: ULID, title: '   ' })).toBe(`/notes/untitled-${ULID}`);
  });
});

describe('parseSlugId', () => {
  it('returns bare ULID unchanged', () => {
    expect(parseSlugId(ULID)).toBe(ULID);
  });

  it('extracts ULID from slug-prefixed param', () => {
    expect(parseSlugId(`my-study-note-${ULID}`)).toBe(ULID);
  });

  it('is case-insensitive for the ULID', () => {
    const lower = ULID.toLowerCase();
    expect(parseSlugId(`note-${lower}`)).toBe(lower);
  });

  it('returns param unchanged when last 26 chars are not a ULID', () => {
    const legacyId = 'abc123';
    expect(parseSlugId(legacyId)).toBe(legacyId);
  });
});

describe('folderHref', () => {
  it('produces slug-id URL under /files', () => {
    expect(folderHref({ id: ULID, name: 'My Folder' })).toBe(`/files/my-folder-${ULID}`);
  });

  it('falls back to "untitled" for empty name', () => {
    expect(folderHref({ id: ULID, name: '' })).toBe(`/files/untitled-${ULID}`);
  });
});

describe('courseItemRouteForAttempt', () => {
  it('maps a course attempt route to the course page with the item selected', () => {
    expect(courseItemRouteForAttempt(`/courses/spanish-${ULID}/tests/ITEM1`)).toBe(
      `/courses/spanish-${ULID}?item=ITEM1`
    );
  });

  it('accepts a trailing slash and a query', () => {
    expect(courseItemRouteForAttempt('/courses/c1/tests/i1/')).toBe('/courses/c1?item=i1');
    expect(courseItemRouteForAttempt('/courses/c1/tests/i1?x=1')).toBe('/courses/c1?item=i1');
  });

  it('returns null for other routes', () => {
    expect(courseItemRouteForAttempt('/courses/c1')).toBeNull();
    expect(courseItemRouteForAttempt('/courses/c1/settings')).toBeNull();
    expect(courseItemRouteForAttempt('/tests/t1')).toBeNull();
    expect(courseItemRouteForAttempt('/courses/c1/tests/i1/extra')).toBeNull();
  });
});

describe('spaceIdFromRoute', () => {
  it('reads the id of a classroom or a course page', () => {
    expect(spaceIdFromRoute(`/classrooms/maths-${ULID}`)).toBe(ULID);
    expect(spaceIdFromRoute(`/courses/spanish-${ULID}`)).toBe(ULID);
  });

  it('reads the id on the sub-pages of a course', () => {
    expect(spaceIdFromRoute(`/courses/${ULID}/settings`)).toBe(ULID);
    expect(spaceIdFromRoute(`/courses/${ULID}/tests/ITEM1`)).toBe(ULID);
  });

  it('returns null for the lists, the join page and other routes', () => {
    expect(spaceIdFromRoute('/courses')).toBeNull();
    expect(spaceIdFromRoute('/classrooms')).toBeNull();
    expect(spaceIdFromRoute('/courses/join/ABC123')).toBeNull();
    expect(spaceIdFromRoute('/tests/t1')).toBeNull();
    expect(spaceIdFromRoute('/')).toBeNull();
  });
});

describe('classroomItemHref', () => {
  it('points to the classroom page (not the course route) with the item selected', () => {
    expect(classroomItemHref({ id: 'abc', title: 'Biology 101' }, 'it 1')).toBe(
      '/classrooms/biology-101-abc?item=it%201'
    );
  });
});

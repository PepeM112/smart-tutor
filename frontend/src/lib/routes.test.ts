import { describe, expect, it } from 'vitest';

import { folderHref, noteHref, parseSlugId } from './routes';

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

describe('parseSlugId (note)', () => {
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

  it('strips diacritics', () => {
    expect(folderHref({ id: ULID, name: 'Ação' })).toBe(`/files/acao-${ULID}`);
  });

  it('falls back to "untitled" for empty name', () => {
    expect(folderHref({ id: ULID, name: '' })).toBe(`/files/untitled-${ULID}`);
  });
});

describe('parseSlugId (folder)', () => {
  it('returns bare ULID unchanged', () => {
    expect(parseSlugId(ULID)).toBe(ULID);
  });

  it('extracts ULID from slug-prefixed param', () => {
    expect(parseSlugId(`my-folder-${ULID}`)).toBe(ULID);
  });

  it('returns param unchanged when last 26 chars are not a ULID', () => {
    expect(parseSlugId('notaulid')).toBe('notaulid');
  });
});

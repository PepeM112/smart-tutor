import { describe, expect, it } from 'vitest';

import { SpaceItemKind, SpaceRole, SpaceStatus, type SpaceItemRead, type SpaceSectionRead } from '@/client';

import { attemptAction, canTrackProgress, continueItem, findItem, findNoteItem } from './progress';

const item = (id: string, extra: Partial<SpaceItemRead> = {}): SpaceItemRead => ({
  id,
  sectionId: 's1',
  kind: SpaceItemKind.NOTE,
  noteId: `note-${id}`,
  testId: null,
  position: 0,
  title: id,
  isDraft: false,
  draftOfId: null,
  ...extra,
});

const section = (items: SpaceItemRead[]): SpaceSectionRead => ({
  id: 's1',
  title: 'S',
  position: 0,
  isDraft: false,
  draftOfId: null,
  items,
});

describe('continueItem', () => {
  it('skips an item that is not visible yet', () => {
    const now = new Date('2026-05-10T12:00:00Z');
    const hidden = item('a', { visibleFrom: new Date('2026-05-11T12:00:00Z') });
    const shown = item('b', { visibleFrom: new Date('2026-05-09T12:00:00Z') });
    expect(continueItem([section([hidden, shown])], null, now)?.id).toBe('b');
    expect(continueItem([section([hidden, shown])], 'a', now)?.id).toBe('b');
    expect(continueItem([section([hidden])], null, now)).toBeNull();
  });

  it('returns the first item that is not done', () => {
    const sections = [section([item('a', { completed: true }), item('b'), item('c')])];
    expect(continueItem(sections)?.id).toBe('b');
  });

  it('returns the last opened item when it is in the outline', () => {
    const sections = [section([item('a'), item('b', { completed: true }), item('c')])];
    expect(continueItem(sections, 'b')?.id).toBe('b');
  });

  it('falls back to the first item not done when the last item is null or not in the outline', () => {
    const sections = [section([item('a', { completed: true }), item('b')])];
    expect(continueItem(sections, null)?.id).toBe('b');
    expect(continueItem(sections, 'gone')?.id).toBe('b');
  });

  it('returns null when every item is done', () => {
    expect(continueItem([section([item('a', { completed: true })])])).toBeNull();
  });

  describe('a TEST item as the last opened item', () => {
    const test = (id: string, extra: Partial<SpaceItemRead> = {}): SpaceItemRead =>
      item(id, { kind: SpaceItemKind.TEST, noteId: null, testId: `test-${id}`, ...extra });

    it('resumes it when an attempt is open', () => {
      const sections = [section([item('a'), test('t', { openAttemptId: 'attempt-1' })])];
      expect(continueItem(sections, 't')?.id).toBe('t');
    });

    it('skips a done test and goes to the first item that is not done', () => {
      const sections = [section([item('a'), test('t', { completed: true }), item('c')])];
      expect(continueItem(sections, 't')?.id).toBe('a');
    });

    it('skips a test with no open attempt, so "Continue" never starts a new attempt', () => {
      const sections = [section([item('a', { completed: true }), test('t'), item('c')])];
      // The first item not done is the test itself: its page shows a Start screen, not an attempt.
      expect(continueItem(sections, 't')?.id).toBe('t');
      const afterPass = [section([item('a', { completed: true }), test('t', { completed: true }), item('c')])];
      expect(continueItem(afterPass, 't')?.id).toBe('c');
    });

    it('returns null for a done test when every other item is done too', () => {
      const sections = [section([item('a', { completed: true }), test('t', { completed: true, attemptsLeft: 0 })])];
      expect(continueItem(sections, 't')).toBeNull();
    });
  });
});

describe('findItem', () => {
  it('finds an item of any kind by id', () => {
    const sections = [section([item('a'), item('b', { kind: SpaceItemKind.TEST, noteId: null })])];
    expect(findItem(sections, 'b')?.kind).toBe(SpaceItemKind.TEST);
    expect(findItem(sections, 'missing')).toBeUndefined();
  });
});

describe('findNoteItem', () => {
  it('finds the NOTE item of a note id', () => {
    const sections = [section([item('a'), item('b')])];
    expect(findNoteItem(sections, 'note-b')?.id).toBe('b');
    expect(findNoteItem(sections, 'missing')).toBeUndefined();
  });
});

describe('attemptAction', () => {
  const now = new Date('2026-01-01T10:00:00Z');

  it('resumes an open attempt, whatever the limits are', () => {
    expect(attemptAction({ openAttemptId: 'x', attemptsLeft: 0, nextAttemptAt: null }, now)).toBe('resume');
  });

  it('blocks a new attempt when none are left', () => {
    expect(attemptAction({ openAttemptId: null, attemptsLeft: 0, nextAttemptAt: null }, now)).toBe('no_attempts_left');
  });

  it('blocks a new attempt during the cooldown', () => {
    const nextAttemptAt = new Date('2026-01-01T11:00:00Z');
    expect(attemptAction({ openAttemptId: null, attemptsLeft: 1, nextAttemptAt }, now)).toBe('cooldown');
  });

  it('starts when the cooldown is over or the attempts are unlimited', () => {
    const nextAttemptAt = new Date('2026-01-01T09:00:00Z');
    expect(attemptAction({ openAttemptId: null, attemptsLeft: 1, nextAttemptAt }, now)).toBe('start');
    expect(attemptAction({ openAttemptId: null, attemptsLeft: null, nextAttemptAt: null }, now)).toBe('start');
  });
});

describe('canTrackProgress', () => {
  it('is true for a viewer of an active course only', () => {
    expect(canTrackProgress({ myRole: SpaceRole.VIEWER, status: SpaceStatus.ACTIVE })).toBe(true);
    expect(canTrackProgress({ myRole: SpaceRole.VIEWER, status: SpaceStatus.ARCHIVED })).toBe(false);
    expect(canTrackProgress({ myRole: SpaceRole.OWNER, status: SpaceStatus.ACTIVE })).toBe(false);
    expect(canTrackProgress({ myRole: null, status: SpaceStatus.ACTIVE })).toBe(false);
  });
});

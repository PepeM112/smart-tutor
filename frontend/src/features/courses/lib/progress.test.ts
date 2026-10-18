import { describe, expect, it } from 'vitest';

import { SpaceItemKind, SpaceRole, SpaceStatus, type SpaceItemRead, type SpaceSectionRead } from '@/client';

import { attemptAction, canTrackProgress, continueItem, findNoteItem } from './progress';

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

import { describe, expect, it } from 'vitest';

import { SpaceKind, type SpaceSummary } from '@/client';

import { splitInvitations } from './invitations';

function space(id: string, kind: SpaceKind): SpaceSummary {
  return { id, kind } as SpaceSummary;
}

describe('splitInvitations', () => {
  it('puts courses and classrooms in separate groups and keeps the order', () => {
    const groups = splitInvitations([
      space('a', SpaceKind.COURSE),
      space('b', SpaceKind.CLASSROOM),
      space('c', SpaceKind.COURSE),
      space('d', SpaceKind.CLASSROOM),
    ]);

    expect(groups.courses.map(s => s.id)).toEqual(['a', 'c']);
    expect(groups.classrooms.map(s => s.id)).toEqual(['b', 'd']);
  });

  it('returns two empty groups for no invitations', () => {
    expect(splitInvitations([])).toEqual({ courses: [], classrooms: [] });
  });
});

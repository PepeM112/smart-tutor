import { describe, expect, it } from 'vitest';

import { SpaceRole } from '@/client';

import { canDo, rolesThatCan, type SpaceAction } from './permissions';

const ROLES = [SpaceRole.OWNER, SpaceRole.EDITOR, SpaceRole.VIEWER, null, undefined] as const;

// Order of each row: OWNER, EDITOR, VIEWER, null, undefined
const EXPECTED: Record<SpaceAction, readonly boolean[]> = {
  viewContent: [true, true, true, false, false],
  editContent: [true, true, false, false, false],
  trackProgress: [false, false, true, false, false],
};

describe('canDo', () => {
  Object.entries(EXPECTED).forEach(([action, allowed]) => {
    ROLES.forEach((role, index) => {
      it(`${action} for role ${String(role)} is ${allowed[index]}`, () => {
        expect(canDo(role, action as SpaceAction)).toBe(allowed[index]);
      });
    });
  });
});

describe('rolesThatCan', () => {
  it('agrees with canDo for every action and role', () => {
    (Object.keys(EXPECTED) as SpaceAction[]).forEach(action => {
      ROLES.forEach(role => {
        expect(role != null && rolesThatCan(action).includes(role)).toBe(canDo(role, action));
      });
    });
  });
});

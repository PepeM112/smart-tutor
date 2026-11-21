import { describe, expect, it } from 'vitest';

import { SpaceRole } from '@/client';

import { canDo, type SpaceAction } from './permissions';

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

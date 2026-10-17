import { describe, expect, it } from 'vitest';

import { SpaceRole } from '@/client';

import { courseAccess } from './membership';

describe('courseAccess', () => {
  it('gives the owner the author view (the owner has no member row, so myStatus is null)', () => {
    expect(courseAccess({ myRole: SpaceRole.OWNER })).toEqual({ isMember: true, isAuthor: true });
  });

  it('gives an editor the author view', () => {
    expect(courseAccess({ myRole: SpaceRole.EDITOR })).toEqual({ isMember: true, isAuthor: true });
  });

  it('gives a viewer the member view only', () => {
    expect(courseAccess({ myRole: SpaceRole.VIEWER })).toEqual({ isMember: true, isAuthor: false });
  });

  it('gives no access without a role (invited, requested or not a member)', () => {
    expect(courseAccess({ myRole: null })).toEqual({ isMember: false, isAuthor: false });
  });
});

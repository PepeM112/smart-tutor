/** The users from `backend/scripts/seed.sh` and `seed_courses.sh`. */
export const PASSWORD = 'Test1234!';

export const USERS = {
  owner: 'reviewer@test.com',
  editor: 'editor@test.com',
  viewer: 'viewer@test.com',
  outsider: 'outsider@test.com',
} as const;

export type UserKey = keyof typeof USERS;

export const authFile = (user: UserKey): string => `e2e/.auth/${user}.json`;

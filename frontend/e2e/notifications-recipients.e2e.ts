import { expect, request as pwRequest, type APIRequestContext } from '@playwright/test';

import { reseedCourses, test } from './helpers';
import { authFile, type UserKey } from './users';

// Who gets a notification for each event (API level), the 99+ badge cap, and the page that a removed
// member sees when a click on an old notification opens the classroom. The seed leaves the student
// with one unread due-soon notification and everyone else with none.
test.describe.configure({ mode: 'serial' });
test.beforeAll(reseedCourses);

const API = '/api/v1';
const USERS: UserKey[] = ['owner', 'editor', 'viewer', 'outsider'];
const contexts: Partial<Record<UserKey, APIRequestContext>> = {};
async function as(user: UserKey): Promise<APIRequestContext> {
  contexts[user] ??= await pwRequest.newContext({ baseURL: 'http://localhost:3000', storageState: authFile(user) });
  return contexts[user];
}

/** The unread count of each user. */
async function unreadCounts(): Promise<Record<UserKey, number>> {
  const rows = await Promise.all(
    USERS.map(async user => {
      const body = (await (await (await as(user)).get(`${API}/notifications?limit=50`)).json()) as {
        items: { readAt: string | null }[];
      };
      return [user, body.items.filter(item => item.readAt === null).length] as const;
    })
  );
  return Object.fromEntries(rows) as Record<UserKey, number>;
}

const delta = (before: Record<UserKey, number>, after: Record<UserKey, number>): Record<UserKey, number> =>
  Object.fromEntries(USERS.map(user => [user, after[user] - before[user]])) as Record<UserKey, number>;

let classroomId = '';
/** More than 99, so the badge shows "99+". */
const BULK_POSTS = 105;

test('a post and a comment reach the right people, and never the actor', async () => {
  const owner = await as('owner');
  const viewer = await as('viewer');
  const outsider = await as('outsider');
  classroomId = ((await (await owner.get(`${API}/classrooms`)).json()) as { id: string }[])[0].id;
  await owner.patch(`${API}/classrooms/${classroomId}/settings`, { data: { feedPermission: 3 } });

  // The outsider joins the classroom by invitation, so there are two students.
  await owner.post(`${API}/spaces/${classroomId}/members`, { data: { identifier: 'outsider' } });
  expect((await outsider.post(`${API}/spaces/${classroomId}/invitation/accept`)).status()).toBe(200);

  const beforePost = await unreadCounts();
  const post = (await (
    await viewer.post(`${API}/spaces/${classroomId}/posts`, { data: { body: 'student post' } })
  ).json()) as { id: string };
  // Everyone but the author.
  expect(delta(beforePost, await unreadCounts())).toEqual({ owner: 1, editor: 1, viewer: 0, outsider: 1 });

  // A comment on a post notifies the author of the post only, and not when the author writes it.
  const beforeComment = await unreadCounts();
  await outsider.post(`${API}/posts/${post.id}/comments`, { data: { body: 'nice' } });
  expect(delta(beforeComment, await unreadCounts())).toEqual({ owner: 0, editor: 0, viewer: 1, outsider: 0 });

  const beforeOwn = await unreadCounts();
  await viewer.post(`${API}/posts/${post.id}/comments`, { data: { body: 'thanks' } });
  expect(delta(beforeOwn, await unreadCounts())).toEqual({ owner: 0, editor: 0, viewer: 0, outsider: 0 });
});

test('a publish with "notify" reaches the students only, and without it nobody', async () => {
  const owner = await as('owner');
  const publishNote = async (title: string, notifyMembers: boolean): Promise<void> => {
    await owner.post(`${API}/spaces/${classroomId}/draft`);
    const section = (await (
      await owner.post(`${API}/spaces/${classroomId}/sections`, { data: { title: `S ${title}` } })
    ).json()) as {
      draftSections: { id: string }[];
    };
    await owner.post(`${API}/spaces/${classroomId}/items`, {
      data: { sectionId: section.draftSections.at(-1)?.id, kind: 1, title },
    });
    expect((await owner.post(`${API}/spaces/${classroomId}/draft/publish`, { data: { notifyMembers } })).status()).toBe(
      200
    );
  };

  const beforeSilent = await unreadCounts();
  await publishNote('Silent note', false);
  expect(delta(beforeSilent, await unreadCounts())).toEqual({ owner: 0, editor: 0, viewer: 0, outsider: 0 });

  const beforeNotify = await unreadCounts();
  await publishNote('Loud note', true);
  expect(delta(beforeNotify, await unreadCounts())).toEqual({ owner: 0, editor: 0, viewer: 1, outsider: 1 });
});

// A publish of the classroom itself fills `space` and `classroom` with the same title: the text names it once.
test('the publish text does not repeat the classroom title', async ({ pageAs }) => {
  const student = await pageAs('viewer');
  await student.goto('/notifications');
  const item = student.getByTestId('notification-item').filter({ hasText: 'New content in' }).first();
  await expect(item).toBeVisible();
  // The text is rendered (positive check first), so the negative check cannot pass on an empty row.
  await expect(item).toContainText('New content in Biology 101');
  await expect(item).not.toContainText('Biology 101 (Biology 101)');
});

test('the badge stops at 99+, and the page pages through every notification', async ({ pageAs }) => {
  const owner = await as('owner');
  // One after the other: 100 parallel posts exhaust the pool of the database connections (see the report).
  await Array.from({ length: BULK_POSTS }, (_, index) => index).reduce<Promise<void>>(async (previous, index) => {
    await previous;
    expect((await owner.post(`${API}/spaces/${classroomId}/posts`, { data: { body: `bulk ${index}` } })).status()).toBe(
      201
    );
  }, Promise.resolve());
  const student = await pageAs('viewer');
  await student.goto('/dashboard');
  await expect(student.getByTestId('notification-badge').first()).toHaveText('99+');
  await student.getByRole('button', { name: /^Notifications/ }).click();
  // The popover shows the latest 10 only.
  await expect(student.getByTestId('notification-item')).toHaveCount(10);
  await student.keyboard.press('Escape');

  await student.goto('/notifications');
  const items = student.getByTestId('notification-item');
  await expect(items).toHaveCount(20);
  const more = student.getByRole('button', { name: 'Load more' });
  await expect(async () => {
    if (await more.isVisible()) await more.click();
    expect(await more.count()).toBe(0);
  }).toPass();
  // The student (viewer) has: the due-soon of the seed (1), the comment on the own post (1), the "Loud note"
  // publish (1) and the 105 bulk posts of the owner. The "Silent note" and the own comment make none.
  expect(await items.count()).toBe(1 + 1 + 1 + BULK_POSTS);
});

test('a removed member who clicks an old notification sees the access page, not an error', async ({ pageAs }) => {
  const owner = await as('owner');
  const members = (await (await owner.get(`${API}/spaces/${classroomId}/members`)).json()) as {
    userId: string;
    username: string;
  }[];
  const studentId = members.find(member => member.username === 'viewer')?.userId;
  expect((await owner.delete(`${API}/spaces/${classroomId}/members/${studentId}`)).status()).toBe(204);

  const student = await pageAs('viewer');
  await student.goto('/notifications');
  await student.getByTestId('notification-item').first().click();
  await expect(student.getByText('You do not have access to this classroom')).toBeVisible();
});

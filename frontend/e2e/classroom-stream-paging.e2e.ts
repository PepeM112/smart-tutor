import { expect, request as pwRequest } from '@playwright/test';

import { openClassroom, reseedCourses, test } from './helpers';
import { authFile } from './users';

// The Stream pages with a cursor. After a write the list restarts from its first page, so a new post at the
// top does not repeat or hide an older post (the cursors of the extra pages were stale).
test.use({ storageState: authFile('owner') });
test.describe.configure({ mode: 'serial' });
test.beforeAll(reseedCourses);

const API = '/api/v1';
const CLASSROOM = 'Biology 101';
const EXTRA_POSTS = 25;

test('a new post after "Load more" repeats no post and hides none', async ({ page }) => {
  const owner = await pwRequest.newContext({ baseURL: 'http://localhost:3000', storageState: authFile('owner') });
  const classroomId = ((await (await owner.get(`${API}/classrooms`)).json()) as { id: string }[])[0].id;
  // One after the other: parallel posts exhaust the pool of the database connections.
  await Array.from({ length: EXTRA_POSTS }, (_, index) => index).reduce<Promise<void>>(async (previous, index) => {
    await previous;
    const created = await owner.post(`${API}/spaces/${classroomId}/posts`, { data: { body: `paging post ${index}` } });
    expect(created.status()).toBe(201);
  }, Promise.resolve());
  await owner.dispose();

  await openClassroom(page, CLASSROOM);
  await page.getByRole('tab', { name: 'Stream' }).click();
  const posts = page.getByTestId('feed-post');
  await expect(posts).toHaveCount(20);
  await page.getByRole('button', { name: 'Load more' }).click();
  // 2 seeded posts + 25 new ones.
  await expect(posts).toHaveCount(EXTRA_POSTS + 2);

  await page.getByRole('textbox', { name: 'Write a post' }).fill('paging post new');
  await page.getByRole('button', { name: 'Post', exact: true }).click();

  // The list restarts from the first page: the new post first, then the 19 newest older posts.
  await expect(posts).toHaveCount(20);
  await expect(posts.first()).toContainText('paging post new');
  await page.getByRole('button', { name: 'Load more' }).click();
  await expect(posts).toHaveCount(EXTRA_POSTS + 3);

  const texts = await posts.allInnerTexts();
  const expected = [
    'paging post new',
    ...Array.from({ length: EXTRA_POSTS }, (_, index) => `paging post ${EXTRA_POSTS - 1 - index}`),
    'The lab starts next week',
    'Welcome to Biology 101!',
  ];
  // Every post shows once and in order: nothing repeated, nothing missing.
  expected.forEach((text, index) => expect(texts[index]).toContain(text));
  expect(texts).toHaveLength(expected.length);
});

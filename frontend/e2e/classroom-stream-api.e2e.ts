import { expect, request as pwRequest, type APIRequestContext } from '@playwright/test';

import { reseedCourses, test } from './helpers';
import { authFile, type UserKey } from './users';

// Direct API checks of the Stream: who may post and comment for each feed permission, the input limits,
// the author-only edit rule, and the archived and former-member cases. The UI is in classroom-stream.e2e.ts.
test.describe.configure({ mode: 'serial' });
test.beforeAll(reseedCourses);

const API = '/api/v1';
// FeedPermission: 1 teachers only, 2 students comment, 3 students post and comment.
type Matrix = Record<UserKey, { post: number; comment: number }>;
const MATRIX: Record<1 | 2 | 3, Matrix> = {
  1: {
    owner: { post: 201, comment: 201 },
    editor: { post: 201, comment: 201 },
    viewer: { post: 403, comment: 403 },
    outsider: { post: 403, comment: 403 },
  },
  2: {
    owner: { post: 201, comment: 201 },
    editor: { post: 201, comment: 201 },
    viewer: { post: 403, comment: 201 },
    outsider: { post: 403, comment: 403 },
  },
  3: {
    owner: { post: 201, comment: 201 },
    editor: { post: 201, comment: 201 },
    viewer: { post: 201, comment: 201 },
    outsider: { post: 403, comment: 403 },
  },
};
const USERS: UserKey[] = ['owner', 'editor', 'viewer', 'outsider'];

const contexts: Partial<Record<UserKey, APIRequestContext>> = {};
async function as(user: UserKey): Promise<APIRequestContext> {
  contexts[user] ??= await pwRequest.newContext({ baseURL: 'http://localhost:3000', storageState: authFile(user) });
  return contexts[user];
}

let classroomId = '';
let anchorPostId = '';

test('the permission matrix: who can post and comment, for each feed permission', async () => {
  const owner = await as('owner');
  classroomId = ((await (await owner.get(`${API}/classrooms`)).json()) as { id: string }[])[0].id;
  anchorPostId = ((await (await owner.get(`${API}/spaces/${classroomId}/posts`)).json()) as { items: { id: string }[] })
    .items[0].id;

  const permissions = [1, 2, 3] as const;
  const outcome = await permissions.reduce<Promise<Record<number, Matrix>>>(async (previous, permission) => {
    const done = await previous;
    await owner.patch(`${API}/classrooms/${classroomId}/settings`, { data: { feedPermission: permission } });
    const rows = await Promise.all(
      USERS.map(async user => {
        const ctx = await as(user);
        const post = await ctx.post(`${API}/spaces/${classroomId}/posts`, { data: { body: `${user} post` } });
        const comment = await ctx.post(`${API}/posts/${anchorPostId}/comments`, { data: { body: `${user} comment` } });
        return [user, { post: post.status(), comment: comment.status() }] as const;
      })
    );
    return { ...done, [permission]: Object.fromEntries(rows) as Matrix };
  }, Promise.resolve({}));

  expect(outcome).toEqual(MATRIX);
});

test('a non-member cannot read the Stream, and the author-only edit rule holds', async () => {
  const outsider = await as('outsider');
  expect((await outsider.get(`${API}/spaces/${classroomId}/posts`)).status()).toBe(403);

  const owner = await as('owner');
  const editor = await as('editor');
  const posts = (await (await owner.get(`${API}/spaces/${classroomId}/posts`)).json()) as {
    items: { id: string; body: string }[];
  };
  const ownerPost = posts.items.find(post => post.body === 'owner post');
  expect(ownerPost).toBeDefined();
  // A co-teacher cannot edit the post of the owner, and a non-member cannot edit or delete it.
  expect((await editor.patch(`${API}/posts/${ownerPost?.id}`, { data: { body: 'hijack' } })).status()).toBe(403);
  expect((await outsider.patch(`${API}/posts/${ownerPost?.id}`, { data: { body: 'hijack' } })).status()).toBe(403);
  expect((await outsider.delete(`${API}/posts/${ownerPost?.id}`)).status()).toBe(403);
  expect((await owner.patch(`${API}/posts/${ownerPost?.id}`, { data: { body: 'owner post edited' } })).status()).toBe(
    200
  );
});

test('the text limits: 5000 characters for a post, 2000 for a comment, no empty text', async () => {
  const owner = await as('owner');
  const post = (body: unknown) => owner.post(`${API}/spaces/${classroomId}/posts`, { data: { body } });
  const comment = (body: unknown) => owner.post(`${API}/posts/${anchorPostId}/comments`, { data: { body } });

  expect((await post('a'.repeat(5000))).status()).toBe(201);
  expect((await post('a'.repeat(5001))).status()).toBe(422);
  expect((await post('')).status()).toBe(422);
  expect((await post('   \n\t ')).status()).toBe(422);
  expect((await post(null)).status()).toBe(422);
  expect((await comment('a'.repeat(2000))).status()).toBe(201);
  expect((await comment('a'.repeat(2001))).status()).toBe(422);
  expect((await comment(' ')).status()).toBe(422);
  // A text with markup and emoji is stored as plain text.
  expect((await post('<script>1</script> 😀 مرحبا')).status()).toBe(201);
});

test('a student who left cannot read or write, and an archived classroom refuses every write', async () => {
  const owner = await as('owner');
  const viewer = await as('viewer');
  await owner.patch(`${API}/classrooms/${classroomId}/settings`, { data: { feedPermission: 3 } });

  const own = await viewer.post(`${API}/spaces/${classroomId}/posts`, { data: { body: 'before archive' } });
  const ownId = ((await own.json()) as { id: string }).id;

  await owner.post(`${API}/spaces/${classroomId}/archive`);
  expect((await viewer.post(`${API}/spaces/${classroomId}/posts`, { data: { body: 'x' } })).status()).toBe(409);
  expect((await viewer.post(`${API}/posts/${anchorPostId}/comments`, { data: { body: 'x' } })).status()).toBe(409);
  expect((await owner.delete(`${API}/posts/${ownId}`)).status()).toBe(409);
  // Reads still work.
  expect((await viewer.get(`${API}/spaces/${classroomId}/posts`)).status()).toBe(200);
  await owner.post(`${API}/spaces/${classroomId}/unarchive`);

  expect((await viewer.post(`${API}/spaces/${classroomId}/leave`)).status()).toBe(204);
  expect((await viewer.get(`${API}/spaces/${classroomId}/posts`)).status()).toBe(403);
  expect((await viewer.post(`${API}/spaces/${classroomId}/posts`, { data: { body: 'x' } })).status()).toBe(403);
  expect((await viewer.delete(`${API}/posts/${ownId}`)).status()).toBe(403);
});

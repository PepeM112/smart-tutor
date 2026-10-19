import { expect, type Page } from '@playwright/test';

import { expectToast, openClassroom, reseedCourses, spaceIdFromUrl, test } from './helpers';
import { authFile } from './users';

const CLASSROOM = 'Biology 101';
const ANNOUNCEMENT = 'E2E announcement for the class';
const STUDENT_COMMENT = 'Thanks, I will start tonight.';

// The teachers and the student share one classroom Stream. The tests run in order: later ones use earlier posts.
test.use({ storageState: authFile('owner') });
test.describe.configure({ mode: 'serial' });
test.beforeAll(reseedCourses);

let classroomId = '';
let classroomPath = '';

async function openStream(page: Page): Promise<void> {
  await openClassroom(page, CLASSROOM);
  await page.getByRole('tab', { name: 'Stream' }).click();
  await expect(page.getByTestId('feed-post').first()).toBeVisible();
}

function postCard(page: Page, text: string) {
  return page.getByTestId('feed-post').filter({ hasText: text });
}

/** The owner changes who can post in the Stream (Settings tab, owner only). */
async function setFeedPermission(page: Page, label: string): Promise<void> {
  await openClassroom(page, CLASSROOM);
  await page.getByRole('tab', { name: 'Settings' }).click();
  await page.locator('#feed-permission').selectOption({ label });
  await expectToast(page, 'Settings saved');
}

test('S1: the seeded posts show, newest first', async ({ page }) => {
  await openStream(page);
  classroomId = spaceIdFromUrl(page);
  classroomPath = new URL(page.url()).pathname;
  const posts = page.getByTestId('feed-post');
  await expect(posts).toHaveCount(2);
  await expect(posts.first()).toContainText('The lab starts next week');
  await expect(posts.last()).toContainText('Welcome to Biology 101!');
  await expect(posts.last()).toContainText(STUDENT_COMMENT);
});

test('S2: the teacher posts, and the post is first in the list', async ({ page }) => {
  await openStream(page);
  const field = page.getByRole('textbox', { name: 'Write a post' });
  const submit = page.getByRole('button', { name: 'Post', exact: true });

  // An empty text cannot be sent.
  await expect(submit).toBeDisabled();
  await field.fill(`   ${ANNOUNCEMENT}   `);
  await submit.click();
  await expectToast(page, 'Post published');

  await expect(page.getByTestId('feed-post').first()).toContainText(ANNOUNCEMENT);
  // The text is saved trimmed, and the composer is empty again.
  await expect(page.getByTestId('feed-post').first().locator('p').first()).toHaveText(ANNOUNCEMENT);
  await expect(field).toHaveValue('');
});

test('S3: the student comments on the post', async ({ pageAs }) => {
  const student = await pageAs('viewer');
  await openStream(student);

  const card = postCard(student, ANNOUNCEMENT);
  await card.getByRole('textbox', { name: 'Write a comment' }).fill('Understood, thank you.');
  await card.getByRole('button', { name: 'Comment', exact: true }).click();
  await expectToast(student, 'Comment added');
  await expect(card.getByTestId('feed-comment')).toContainText('Understood, thank you.');
});

test('S4: under the default permission the student cannot post, in the UI or in the API', async ({ pageAs }) => {
  const student = await pageAs('viewer');
  await openStream(student);
  await expect(student.getByRole('textbox', { name: 'Write a post' })).toHaveCount(0);
  await expect(postCard(student, ANNOUNCEMENT).getByRole('textbox', { name: 'Write a comment' })).toBeVisible();

  const response = await student.request.post(`/api/v1/spaces/${classroomId}/posts`, { data: { body: 'Sneaky post' } });
  expect(response.status()).toBe(403);
});

test('S5: the owner changes the feed permission, and the student composers follow', async ({ page, pageAs }) => {
  const student = await pageAs('viewer');
  await openStream(student);

  await setFeedPermission(page, 'Post and comment');
  await student.reload();
  await expect(student.getByRole('textbox', { name: 'Write a post' })).toBeVisible();

  await setFeedPermission(page, 'Only read (teachers post)');
  await student.reload();
  await expect(student.getByTestId('feed-post').first()).toBeVisible();
  await expect(student.getByRole('textbox', { name: 'Write a post' })).toHaveCount(0);
  await expect(student.getByRole('textbox', { name: 'Write a comment' })).toHaveCount(0);

  await setFeedPermission(page, 'Comment on posts');
  await student.reload();
  await expect(student.getByRole('textbox', { name: 'Write a comment' }).first()).toBeVisible();
  await expect(student.getByRole('textbox', { name: 'Write a post' })).toHaveCount(0);
});

test('S6: the author edits the own post and "edited" shows; others cannot edit it', async ({ page, pageAs }) => {
  await openStream(page);
  const card = postCard(page, ANNOUNCEMENT);
  await expect(card).not.toContainText('(edited)');

  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await card.getByRole('textbox', { name: 'Edit post' }).fill(`${ANNOUNCEMENT} (updated)`);
  await card.getByRole('button', { name: 'Save', exact: true }).click();
  await expectToast(page, 'Post saved');
  await expect(postCard(page, '(updated)')).toContainText('(edited)');

  // The owner cannot edit the post of the co-teacher.
  await expect(
    postCard(page, 'The lab starts next week').getByRole('button', { name: 'Edit', exact: true })
  ).toHaveCount(0);

  // The student sees the new text and no edit or delete button.
  const student = await pageAs('viewer');
  await openStream(student);
  const studentCard = postCard(student, '(updated)');
  await expect(studentCard).toContainText('(edited)');
  // The first block of the card is the post header. The comments below have their own buttons.
  const header = studentCard.locator(':scope > div').first();
  await expect(header.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await expect(header.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
});

test('S7: the teacher deletes a comment of a student', async ({ page, pageAs }) => {
  await openStream(page);
  const comment = page.getByTestId('feed-comment').filter({ hasText: STUDENT_COMMENT });
  // A teacher can delete the comment of a student, but not edit it.
  await expect(comment.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await comment.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expectToast(page, 'Comment deleted');
  await expect(page.getByText(STUDENT_COMMENT)).toHaveCount(0);

  // The other comment stays, and the student does not see the deleted one.
  const student = await pageAs('viewer');
  await openStream(student);
  await expect(student.getByText(STUDENT_COMMENT)).toHaveCount(0);
  await expect(student.getByText('Understood, thank you.')).toBeVisible();
});

test('S8: a user who is not a member cannot open the Stream', async ({ pageAs }) => {
  const outsider = await pageAs('outsider');
  await outsider.goto(`${classroomPath}?tab=stream`);
  await expect(outsider.getByText('You do not have access to this classroom')).toBeVisible();
  await expect(outsider.getByTestId('feed-post')).toHaveCount(0);

  const response = await outsider.request.get(`/api/v1/spaces/${classroomId}/posts`);
  expect([403, 404]).toContain(response.status());
});

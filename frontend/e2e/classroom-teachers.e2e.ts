import { expect, type Page } from '@playwright/test';

import { expectToast, openClassroom, reseedCourses, spaceIdFromUrl, test } from './helpers';
import { authFile } from './users';

const CLASSROOM = 'Biology 101';

// The co-teacher edits, publishes and manages students. The file reseeds before it starts.
test.use({ storageState: authFile('editor') });
test.describe.configure({ mode: 'serial' });
test.beforeAll(reseedCourses);

function memberRow(page: Page, username: string) {
  return page.getByRole('row').filter({ hasText: `@${username}` });
}

async function openRowMenu(page: Page, username: string): Promise<void> {
  const row = memberRow(page, username);
  await row.hover();
  await row.getByRole('button', { name: 'Action' }).click();
}

test('C5: the co-teacher sees four tabs and no Settings tab', async ({ page }) => {
  await openClassroom(page, CLASSROOM);
  await expect(page.getByRole('tab')).toHaveText(['Stream', 'Classwork', 'Members', 'Grades']);
  await expect(page.getByText('Co-teacher', { exact: true })).toBeVisible();
});

test('C7: the co-teacher sees the scheduled item, marked as Scheduled', async ({ page }) => {
  await openClassroom(page, CLASSROOM);
  const row = page.getByRole('listitem').filter({ hasText: 'Surprise note' }).first();
  await expect(row).toBeVisible();
  await expect(row.getByTestId('schedule-badges')).toContainText('Scheduled for');
});

test('C5: the co-teacher edits and publishes the classroom', async ({ page, pageAs }) => {
  await openClassroom(page, CLASSROOM);
  await page.getByRole('button', { name: 'Edit course' }).click();
  await page.getByRole('textbox', { name: 'New section title' }).fill('Co-teacher section');
  const sectionWritten = page.waitForResponse(
    response => response.request().method() === 'POST' && /\/spaces\/[^/]+\/sections$/.test(response.url())
  );
  await page.getByRole('button', { name: 'Add section' }).click();
  expect((await sectionWritten).ok()).toBe(true);
  await expect(page.getByRole('heading', { name: 'Co-teacher section' })).toBeVisible();

  await page.getByRole('button', { name: 'Publish' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Publish' }).click();
  await expectToast(page, 'Classroom published');

  const student = await pageAs('viewer');
  await openClassroom(student, CLASSROOM);
  await expect(student.getByRole('heading', { name: 'Co-teacher section' })).toBeVisible();
});

test('C5: the co-teacher invites a user and cancels the invitation', async ({ page }) => {
  await openClassroom(page, CLASSROOM);
  await page.getByRole('tab', { name: 'Members' }).click();
  await page.getByRole('button', { name: 'Invite' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').first().fill('outsider');
  await dialog.getByRole('button', { name: /Invite/ }).click();
  await expectToast(page, 'Invitation sent');
  await expect(memberRow(page, 'outsider')).toContainText('Invited');

  await openRowMenu(page, 'outsider');
  await page.getByRole('menuitem', { name: 'Cancel invitation' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel invitation' }).click();
  await expect(memberRow(page, 'outsider')).toHaveCount(0);
});

test('C5: the co-teacher cannot change a role (menu and API), but can remove a student', async ({ page }) => {
  await openClassroom(page, CLASSROOM);
  const classroomId = spaceIdFromUrl(page);
  await page.getByRole('tab', { name: 'Members' }).click();
  await expect(memberRow(page, 'viewer')).toContainText('Student');

  await openRowMenu(page, 'viewer');
  await expect(page.getByRole('menuitem', { name: 'Make co-teacher' })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: 'Remove member' })).toBeVisible();
  await page.keyboard.press('Escape');

  // The API refuses too.
  const members = await page.request.get(`/api/v1/spaces/${classroomId}/members`);
  expect(members.ok()).toBe(true);
  const list = (await members.json()) as { userId: string; username: string }[];
  const student = list.find(member => member.username === 'viewer');
  expect(student).toBeDefined();
  const change = await page.request.patch(`/api/v1/spaces/${classroomId}/members/${student?.userId}`, {
    data: { role: 2 },
  });
  expect(change.status()).toBe(403);

  await openRowMenu(page, 'viewer');
  await page.getByRole('menuitem', { name: 'Remove member' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove member' }).click();
  await expect(memberRow(page, 'viewer')).toHaveCount(0);
});

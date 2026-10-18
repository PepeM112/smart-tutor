import { expect } from '@playwright/test';

import { expectToast, openClassroom, pageHeading, reseedCourses, spaceIdFromUrl, test } from './helpers';
import { authFile } from './users';

const ROOM = 'E2E Room';

// One story in order: create, fill, publish, join, archive, delete. The file reseeds before it starts.
test.use({ storageState: authFile('owner'), permissions: ['clipboard-read', 'clipboard-write'] });
test.describe.configure({ mode: 'serial' });
test.beforeAll(reseedCourses);

let joinCode = '';

test('the owner creates a classroom (no Public option) and sees the five tabs', async ({ page }) => {
  await page.goto('/classrooms');
  await page.getByRole('button', { name: 'Create classroom' }).click();
  const dialog = page.getByRole('dialog');
  // A classroom is private or unlisted only.
  await expect(dialog.getByRole('button', { name: 'Private' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Unlisted' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Public' })).toHaveCount(0);

  await dialog.locator('#classroom-title').fill(ROOM);
  await dialog.getByRole('button', { name: 'Create classroom' }).click();
  await expectToast(page, 'Classroom created');
  await expect(pageHeading(page, ROOM)).toBeVisible();

  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveText(['Stream', 'Classwork', 'Members', 'Grades', 'Settings']);
});

test('the owner adds a section and a note in edit mode, then publishes', async ({ page }) => {
  await openClassroom(page, ROOM);
  // A new classroom has no published version yet: the page may start in edit mode or not.
  const edit = page.getByRole('button', { name: 'Edit course' });
  if (await edit.isVisible()) await edit.click();

  await page.getByRole('textbox', { name: 'New section title' }).fill('Week A');
  const sectionWritten = page.waitForResponse(
    response => response.request().method() === 'POST' && /\/spaces\/[^/]+\/sections$/.test(response.url())
  );
  await page.getByRole('button', { name: 'Add section' }).click();
  expect((await sectionWritten).ok()).toBe(true);
  await expect(page.getByRole('heading', { name: 'Week A' })).toBeVisible();

  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New note' }).click();
  const itemWritten = page.waitForResponse(
    response => response.request().method() === 'POST' && /\/spaces\/[^/]+\/items$/.test(response.url())
  );
  await page.locator('#item-title').fill('Welcome note');
  await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();
  expect((await itemWritten).ok()).toBe(true);
  // A new note opens in its editor. The crumb leads back to the classroom, not to the course list.
  await page.getByRole('link', { name: ROOM }).click();
  await expect(page).toHaveURL(/\/classrooms\//);
  await expect(pageHeading(page, ROOM)).toBeVisible();
  await expect(page.getByText('Welcome note')).toBeVisible();

  await page.getByRole('button', { name: 'Publish' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Publish' }).click();
  await expectToast(page, 'Classroom published');
  await expect(page.getByRole('button', { name: 'Edit course' })).toBeVisible();

  // Read the join code for the next test.
  await page.getByRole('tab', { name: 'Settings' }).click();
  const code = page.getByRole('button', { name: /^Copy code / });
  await expect(code).toBeVisible();
  // The accessible name is "Copy code <code>".
  joinCode = ((await code.getAttribute('aria-label')) ?? '').replace('Copy code ', '').trim();
  expect(joinCode.length).toBeGreaterThan(3);
});

test('a student joins with the code and sees the item', async ({ pageAs }) => {
  const student = await pageAs('outsider');
  await student.goto('/classrooms');
  await student.getByRole('button', { name: 'Join with code' }).click();
  const dialog = student.getByRole('dialog');
  await dialog.locator('#join-code').fill(joinCode);
  await dialog.getByRole('button', { name: 'Join', exact: true }).click();
  await expectToast(student, 'You joined the classroom');
  await openClassroom(student, ROOM);
  await expect(student.getByRole('heading', { name: 'Week A' })).toBeVisible();
  await expect(student.getByText('Welcome note')).toBeVisible();
  // A student sees neither the teacher tabs nor the edit button.
  await expect(student.getByRole('tab')).toHaveText(['Stream', 'Classwork']);
  await expect(student.getByRole('button', { name: 'Edit course' })).toHaveCount(0);
});

test('archive and unarchive, then Delete forever needs the exact name', async ({ page }) => {
  await openClassroom(page, ROOM);
  await page.getByRole('tab', { name: 'Settings' }).click();

  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Archive' }).click();
  await expectToast(page, 'Classroom archived');
  await expect(page.getByText('This classroom is archived.')).toBeVisible();
  await page.getByRole('button', { name: 'Unarchive' }).click();
  await expectToast(page, 'Classroom unarchived');
  await expect(page.getByText('This classroom is archived.')).toHaveCount(0);

  await page.getByRole('button', { name: 'Delete forever' }).click();
  const confirm = page.getByRole('alertdialog');
  const confirmButton = confirm.getByRole('button', { name: 'Delete forever' });
  await expect(confirmButton).toBeDisabled();
  await confirm.getByLabel('Classroom title').fill('E2E Roo');
  await expect(confirmButton).toBeDisabled();
  await confirm.getByLabel('Classroom title').fill(ROOM);
  await expect(confirmButton).toBeEnabled();
  const id = spaceIdFromUrl(page);
  await confirmButton.click();
  await expectToast(page, 'Classroom deleted');
  await expect(page).toHaveURL(/\/classrooms$/);
  const gone = await page.request.get(`/api/v1/spaces/${id}`);
  expect(gone.status()).toBe(404);
});

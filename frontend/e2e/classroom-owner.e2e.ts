import { expect } from '@playwright/test';

import { expectToast, openClassroom, reseedCourses, spaceIdFromUrl, test } from './helpers';
import { authFile } from './users';

const CLASSROOM = 'Biology 101';

// The owner copies a course in and sets the Class key. The file reseeds before it starts.
test.use({ storageState: authFile('owner') });
test.describe.configure({ mode: 'serial' });
test.beforeAll(reseedCourses);

test('C9: the owner duplicates a standalone course into the classroom and publishes it', async ({ page, pageAs }) => {
  await openClassroom(page, CLASSROOM);
  await page.getByRole('button', { name: 'Edit course' }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).first().click();
  await page.getByRole('menuitem', { name: 'Duplicate a course into this classroom' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('option', { name: 'World Geography' }).click();
  await dialog.getByRole('button', { name: 'Add copy' }).click();
  await expectToast(page, 'Course added');
  await expect(page.getByText('World Geography').first()).toBeVisible();

  await page.getByRole('button', { name: 'Publish' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Publish' }).click();
  await expectToast(page, 'Classroom published');

  const student = await pageAs('viewer');
  await openClassroom(student, CLASSROOM);
  await expect(student.getByText('World Geography').first()).toBeVisible();
});

test('C13: the owner sets the Class key, priority, scope and cap', async ({ page }) => {
  await openClassroom(page, CLASSROOM);
  const classroomId = spaceIdFromUrl(page);
  await page.getByRole('tab', { name: 'Settings' }).click();

  await page.getByRole('button', { name: /Anthropic/ }).click();
  // The key is only stored (encrypted). No call is made with it.
  await page.locator('#class-key').fill('sk-ant-e2e-fake-key');
  await page.locator('#key-priority').selectOption({ label: 'Class key first' });
  await page.locator('#key-scope').selectOption({ label: 'Everywhere' });
  await page.locator('#token-cap').fill('5000');

  const saved = page.waitForResponse(
    response =>
      response.request().method() === 'PATCH' && response.url().endsWith(`/classrooms/${classroomId}/settings`)
  );
  await page.getByRole('button', { name: 'Save', exact: true }).last().click();
  expect((await saved).ok()).toBe(true);
  await expect(page.getByText('Key saved')).toBeVisible();

  // The values are still there after a reload, and the key is never shown again.
  await page.reload();
  await page.getByRole('tab', { name: 'Settings' }).click();
  await expect(page.getByText('Key saved')).toBeVisible();
  await expect(page.locator('#token-cap')).toHaveValue('5000');
  await expect(page.locator('#class-key')).toHaveValue('');
  expect(await page.locator('#key-priority').evaluate(el => (el as HTMLSelectElement).selectedOptions[0]?.text)).toBe(
    'Class key first'
  );
  expect(await page.locator('#key-scope').evaluate(el => (el as HTMLSelectElement).selectedOptions[0]?.text)).toBe(
    'Everywhere'
  );
});

test('C14: once the Class key pays, the student sees no key notice', async ({ pageAs }) => {
  const student = await pageAs('viewer');
  // Wait for the key status, so "no notice" is not just "not loaded yet".
  const status = student.waitForResponse(response => response.url().includes('/ai-key-status'));
  await openClassroom(student, CLASSROOM);
  expect((await status).ok()).toBe(true);
  await expect(student.getByTestId('ai-key-notice')).toHaveCount(0);
});

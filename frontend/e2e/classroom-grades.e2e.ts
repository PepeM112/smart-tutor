import { expect, type Page } from '@playwright/test';

import { expectToast, openClassroom, reseedCourses, test } from './helpers';
import { authFile } from './users';

const CLASSROOM = 'Biology 101';

// The owner overrides one answer, then the student reads it. The file reseeds before it starts.
test.use({ storageState: authFile('owner') });
test.describe.configure({ mode: 'serial' });
test.beforeAll(reseedCourses);

// The result page of the student, found in the gradebook.
let resultUrl = '';

async function openGrades(page: Page): Promise<void> {
  await openClassroom(page, CLASSROOM);
  await page.getByRole('tab', { name: 'Grades' }).click();
  await expect(page.getByTestId('gradebook')).toBeVisible();
}

test('C10: the gradebook shows the best score and opens the result', async ({ page }) => {
  await openGrades(page);
  const row = page
    .getByTestId('gradebook')
    .getByRole('row')
    .filter({ hasText: /viewer/i });
  await expect(row).toContainText('50%');
  await expect(row).toContainText('Failed');
  // No override yet: no marker.
  await expect(row.getByLabel('Graded by a teacher')).toHaveCount(0);

  await row.getByRole('link', { name: /50%/ }).click();
  await expect(page).toHaveURL(/\/history\/.+/);
  resultUrl = page.url();
  // The teacher sees the grade panel when a question opens.
  await page.getByRole('button', { name: /Type nucleus/ }).click();
  await expect(page.getByTestId('teacher-grade')).toBeVisible();
});

test('C10: the teacher overrides one answer score', async ({ page }) => {
  await page.goto(resultUrl);
  // The answer to "nucleus" is wrong in the seed.
  await page.getByRole('button', { name: /Type nucleus/ }).click();
  const panel = page.getByTestId('teacher-grade');
  await panel.getByRole('button', { name: 'Override grade' }).click();
  await panel.getByLabel(/^Score \(0 to /).fill('1');
  const saved = page.waitForResponse(
    response => response.request().method() === 'PUT' && /\/answers\/[^/]+\/override$/.test(response.url())
  );
  await panel.getByRole('button', { name: 'Save' }).click();
  expect((await saved).ok()).toBe(true);
  await expectToast(page, 'Grade saved');
  await expect(panel).toContainText('Teacher grade');
});

test('C10: the gradebook shows the overridden marker and the new score', async ({ page }) => {
  await openGrades(page);
  const row = page
    .getByTestId('gradebook')
    .getByRole('row')
    .filter({ hasText: /viewer/i });
  await expect(row.getByLabel('Graded by a teacher')).toBeVisible();
  await expect(row).toContainText('100%');
});

test('C11: the student sees "Graded by your teacher" and cannot override', async ({ pageAs }) => {
  const student = await pageAs('viewer');
  await student.goto(resultUrl);
  await student.getByRole('button', { name: /Type nucleus/ }).click();
  const grade = student.getByTestId('teacher-grade');
  await expect(grade).toHaveCount(1);
  await expect(grade).toContainText('Graded by your teacher');
  await expect(student.getByRole('button', { name: 'Override grade' })).toHaveCount(0);
  await expect(student.getByRole('button', { name: 'Edit grade' })).toHaveCount(0);
});

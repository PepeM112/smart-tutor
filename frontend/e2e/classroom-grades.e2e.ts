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
  // R15: the teacher sees whose result it is.
  await expect(page.getByTestId('result-student')).toContainText(/viewer/i);
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
  // R15: the student gets no name line on a result.
  await expect(student.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect(student.getByTestId('result-student')).toHaveCount(0);
});

test('R17: a passed cell has no Remove completion button', async ({ page }) => {
  await openGrades(page);
  const row = page
    .getByTestId('gradebook')
    .getByRole('row')
    .filter({ hasText: /viewer/i });
  await expect(row).toContainText('Passed');
  await expect(row.getByRole('button', { name: 'Remove completion' })).toHaveCount(0);
});

test('R17: a lower grade keeps the completion, and the teacher removes it after a confirm', async ({ page }) => {
  // The teacher removes the override: the score goes back to 50%, but the completion stays (progress is sticky).
  await page.goto(resultUrl);
  await page.getByRole('button', { name: /Type nucleus/ }).click();
  await page.getByTestId('teacher-grade').getByRole('button', { name: 'Remove override' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove override' }).click();
  await expectToast(page, 'Override removed');

  await openGrades(page);
  const row = page
    .getByTestId('gradebook')
    .getByRole('row')
    .filter({ hasText: /viewer/i });
  // The score is 50% again, but the pass stays (progress is sticky): the cell still says Passed.
  await expect(row).toContainText('50%');
  await expect(row).toContainText('Passed');
  const remove = row.getByRole('button', { name: 'Remove completion' });
  await expect(remove).toBeVisible();

  // Cancel keeps the button.
  await remove.click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(remove).toBeVisible();

  const removed = page.waitForResponse(
    response =>
      response.request().method() === 'DELETE' && /\/items\/[^/]+\/students\/[^/]+\/completion$/.test(response.url())
  );
  await remove.click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove completion' }).click();
  expect((await removed).status()).toBe(204);
  await expectToast(page, 'Completion removed');
  await expect(row.getByRole('button', { name: 'Remove completion' })).toHaveCount(0);
  await expect(row).toContainText('Failed');
});

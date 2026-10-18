import { expect, type Page } from '@playwright/test';

import { openClassroom, reseedCourses, test } from './helpers';
import { authFile } from './users';

const CLASSROOM = 'Biology 101';

// The student reads the seeded classroom. Only the progress test writes (it marks one note).
test.use({ storageState: authFile('viewer') });
test.describe.configure({ mode: 'serial' });
test.beforeAll(reseedCourses);

/** The row of one item in the classwork list. The Due soon list is above it, so the outline row is the last match. */
function itemRow(page: Page, title: string) {
  return page.getByRole('listitem').filter({ hasText: title }).last();
}

test('C8: the item due in 24 hours shows in Due soon, the later ones do not', async ({ page }) => {
  await openClassroom(page, CLASSROOM);
  const dueSoon = page.getByRole('region', { name: 'Due soon' });
  await expect(dueSoon).toContainText('Cell quiz');
  await expect(dueSoon).not.toContainText('Genetics exam');
  // The Due line shows on the item row too.
  await expect(itemRow(page, 'Cell quiz').getByTestId('schedule-badges')).toContainText('Due');
});

test('C6: a test that is not open yet shows a disabled button', async ({ page }) => {
  await openClassroom(page, CLASSROOM);
  const row = itemRow(page, 'Genetics exam');
  await expect(row.getByTestId('schedule-badges')).toContainText('Opens');
  await expect(row.getByRole('button', { name: 'The test is not open yet' })).toBeDisabled();
  await expect(row.getByRole('link', { name: 'Start', exact: true })).toHaveCount(0);
});

test('C7: an item with a future "visible from" is hidden from the student', async ({ page }) => {
  await openClassroom(page, CLASSROOM);
  await expect(page.getByText('Cell basics')).toBeVisible();
  await expect(page.getByText('Surprise note')).toHaveCount(0);
});

test('C14: a student with no key sees the "AI is not available" notice', async ({ page }) => {
  await openClassroom(page, CLASSROOM);
  await expect(page.getByTestId('ai-key-notice')).toContainText('AI is not available here');
});

test('C4: marking a note of the classroom course done shows progress on the COURSE row', async ({ page }) => {
  await openClassroom(page, CLASSROOM);
  const courseRow = itemRow(page, 'Cell Lab');
  await expect(courseRow.getByTestId('course-progress')).toContainText('0%');

  await courseRow.getByRole('link', { name: /Cell Lab/ }).click();
  await page.getByRole('button', { name: /Lab safety/ }).click();
  await page.getByRole('button', { name: 'Mark complete' }).click();
  await expect(page.getByRole('button', { name: 'Mark as not done' })).toBeVisible();

  await openClassroom(page, CLASSROOM);
  await expect(itemRow(page, 'Cell Lab').getByTestId('course-progress')).toContainText('50%');
});

test('F-P0: a test placed in the classroom itself keeps the Classrooms breadcrumb, not the course route', async ({
  page,
}) => {
  await openClassroom(page, CLASSROOM);
  await page
    .getByRole('region', { name: 'Due soon' })
    .getByRole('link', { name: /Cell quiz/ })
    .click();
  await expect(page).toHaveURL(/\/courses\/.+\/tests\//);

  // The breadcrumb sits in the header, next to the h1 (the sidebar has its own "Classrooms" link).
  const header = page.getByRole('heading', { level: 1 }).locator('..');
  await expect(header.getByRole('link', { name: 'Classrooms', exact: true })).toHaveAttribute('href', '/classrooms');
  await expect(header.getByRole('link', { name: CLASSROOM })).toHaveAttribute('href', /^\/classrooms\//);
  await expect(header.getByRole('link', { name: 'Courses', exact: true })).toHaveCount(0);
});

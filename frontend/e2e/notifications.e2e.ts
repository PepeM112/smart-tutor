import { expect, type Page } from '@playwright/test';

import { expectToast, openClassroom, pageHeading, reseedCourses, test } from './helpers';
import { authFile } from './users';

const CLASSROOM = 'Biology 101';

// The teacher writes, and the student reads the bell. The seed leaves the student with one notification
// (the "Cell quiz" is due in 12 hours, so the first bell fetch makes a due-soon one). The tests run in order.
test.use({ storageState: authFile('owner') });
test.describe.configure({ mode: 'serial' });
test.beforeAll(reseedCourses);

/** The bell button. Its accessible name has the unread count: "Notifications, 2 unread". */
function bell(page: Page) {
  return page.getByRole('button', { name: /^Notifications/ });
}

function unreadName(count: number): string {
  return count === 0 ? 'Notifications' : `Notifications, ${count} unread`;
}

/** The teacher publishes a post in the Stream of the classroom. */
async function teacherPosts(page: Page, text: string): Promise<void> {
  await openClassroom(page, CLASSROOM);
  await page.getByRole('tab', { name: 'Stream' }).click();
  await page.getByRole('textbox', { name: 'Write a post' }).fill(text);
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await expectToast(page, 'Post published');
}

test('N1: the student has the due-soon badge, then a new one after the teacher posts', async ({ page, pageAs }) => {
  const student = await pageAs('viewer');
  await student.goto('/dashboard');
  await expect(bell(student)).toHaveAccessibleName(unreadName(1));

  await teacherPosts(page, 'First notification post');

  // The bell polls every 30 seconds. A reload asks for the count at once.
  await student.reload();
  await expect(bell(student)).toHaveAccessibleName(unreadName(2));
  await expect(student.getByTestId('notification-badge').first()).toHaveText('2');
});

test('N2: a click on a notification opens the page, marks it read and lowers the count', async ({ pageAs }) => {
  const student = await pageAs('viewer');
  await student.goto('/dashboard');
  await expect(bell(student)).toHaveAccessibleName(unreadName(2));

  await bell(student).click();
  const item = student.getByTestId('notification-item').filter({ hasText: 'First notification post' });
  await expect(item).toHaveAttribute('data-unread', 'true');
  await item.click();

  await expect(student).toHaveURL(/\/classrooms\/.+tab=stream/);
  await expect(pageHeading(student, CLASSROOM)).toBeVisible();
  await expect(bell(student)).toHaveAccessibleName(unreadName(1));
});

test('N3: "Mark all read" clears the badge', async ({ page, pageAs }) => {
  await teacherPosts(page, 'Second notification post');

  const student = await pageAs('viewer');
  await student.goto('/dashboard');
  await expect(bell(student)).toHaveAccessibleName(unreadName(2));

  await bell(student).click();
  await student.getByRole('button', { name: 'Mark all read' }).click();
  await expect(bell(student)).toHaveAccessibleName(unreadName(0));
  await expect(student.getByTestId('notification-badge')).toHaveCount(0);
});

test('N4: the page lists all notifications, and the Unread filter shows the unread ones', async ({ page, pageAs }) => {
  await teacherPosts(page, 'Third notification post');

  const student = await pageAs('viewer');
  await student.goto('/notifications');
  const items = student.getByTestId('notification-item');
  // The due-soon notification and three posts.
  await expect(items).toHaveCount(4);
  await expect(items.filter({ hasText: 'Third notification post' })).toHaveAttribute('data-unread', 'true');

  await student.getByRole('button', { name: 'Filters' }).click();
  await student.getByRole('dialog').getByText('Unread', { exact: true }).click();
  await student.keyboard.press('Escape');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText('Third notification post');

  await student.getByRole('button', { name: 'Mark all read' }).click();
  await expect(student.getByText('No unread notifications')).toBeVisible();
  await expect(bell(student)).toHaveAccessibleName(unreadName(0));
});

test('N5: the due-soon notification for the Cell quiz shows exactly once', async ({ pageAs }) => {
  const student = await pageAs('viewer');
  await student.goto('/notifications');
  const dueSoon = student.getByTestId('notification-item').filter({ hasText: 'Cell quiz' });
  await expect(dueSoon).toHaveCount(1);
  await expect(dueSoon).toContainText('is due');

  // Every bell fetch tries to make it again: the list must not get a second row.
  await student.reload();
  await expect(bell(student)).toBeVisible();
  await student.goto('/dashboard');
  await bell(student).click();
  await expect(student.getByTestId('notification-item').filter({ hasText: 'Cell quiz' })).toHaveCount(1);
});

test('N6: a grade override reaches the student, and a click opens the result', async ({ page, pageAs }) => {
  await openClassroom(page, CLASSROOM);
  await page.getByRole('tab', { name: 'Grades' }).click();
  await page
    .getByTestId('gradebook')
    .getByRole('row')
    .filter({ hasText: /viewer/i })
    .getByRole('link', { name: /50%/ })
    .click();
  await expect(page).toHaveURL(/\/history\/.+/);
  await page.getByRole('button', { name: /Type nucleus/ }).click();
  const panel = page.getByTestId('teacher-grade');
  await panel.getByRole('button', { name: 'Override grade' }).click();
  await panel.getByLabel(/^Score \(0 to /).fill('1');
  await panel.getByRole('button', { name: 'Save' }).click();
  await expectToast(page, 'Grade saved');

  const student = await pageAs('viewer');
  await student.goto('/dashboard');
  await expect(bell(student)).toHaveAccessibleName(unreadName(1));
  await bell(student).click();
  const item = student.getByTestId('notification-item').filter({ hasText: 'changed your grade on Cell quiz' });
  await expect(item).toHaveCount(1);
  await item.click();
  await expect(student).toHaveURL(/\/history\/.+/);
  await expect(bell(student)).toHaveAccessibleName(unreadName(0));
});

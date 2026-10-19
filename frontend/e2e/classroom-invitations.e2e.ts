import { expect, type Page } from '@playwright/test';

import { expectToast, openClassroom, openCourse, reseedCourses, test } from './helpers';
import { authFile } from './users';

// R14: the invitation popover has one section for courses and one for classrooms.
// The owner invites the outsider to one course and to one classroom. The file reseeds before it starts.
test.use({ storageState: authFile('owner') });
test.describe.configure({ mode: 'serial' });
test.beforeAll(reseedCourses);

async function inviteOutsider(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Members' }).click();
  await page.getByRole('button', { name: 'Invite' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').first().fill('outsider');
  await dialog.getByRole('button', { name: /Invite/ }).click();
  await expectToast(page, 'Invitation sent');
}

test('R14: the owner invites the outsider to a course and to a classroom', async ({ page }) => {
  await openCourse(page, 'Spanish Basics');
  await inviteOutsider(page);

  await openClassroom(page, 'Biology 101');
  await inviteOutsider(page);
});

test('R14: the invitations show in a Courses and a Classrooms section, and Accept joins the classroom', async ({
  pageAs,
}) => {
  const outsider = await pageAs('outsider');
  await outsider.goto('/classrooms');
  await outsider.getByRole('button', { name: 'Invitations (2)' }).click();

  const sections = outsider.getByTestId('invitation-section');
  await expect(sections).toHaveCount(2);
  const courses = sections.filter({ has: outsider.getByRole('heading', { name: 'Courses' }) });
  const classrooms = sections.filter({ has: outsider.getByRole('heading', { name: 'Classrooms' }) });
  await expect(courses).toContainText('Spanish Basics');
  await expect(courses).not.toContainText('Biology 101');
  await expect(classrooms).toContainText('Biology 101');
  await expect(classrooms).not.toContainText('Spanish Basics');

  await classrooms.getByRole('button', { name: 'Accept' }).click();
  await expectToast(outsider, 'You joined the classroom');
  // Only the course invitation is left: one section, no empty Classrooms heading.
  await expect(outsider.getByRole('button', { name: 'Invitations (1)' })).toBeVisible();
  await expect(sections).toHaveCount(1);
  await expect(sections.getByRole('heading', { name: 'Classrooms' })).toHaveCount(0);
});

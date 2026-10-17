import { expect, type Page, test } from '@playwright/test';

import { expectToast, openCourse, reseedCourses } from './helpers';
import { authFile } from './users';

test.use({ storageState: authFile('owner') });
// The tests change the members in order (approve, invite, remove). The file reseeds before it starts.
test.describe.configure({ mode: 'serial' });
test.beforeAll(reseedCourses);

function memberRow(page: Page, username: string) {
  return page.getByRole('row').filter({ hasText: `@${username}` });
}

async function rowAction(page: Page, username: string, action: string): Promise<void> {
  const row = memberRow(page, username);
  await row.hover();
  await row.getByRole('button', { name: 'Action' }).click();
  await page.getByRole('menuitem', { name: action }).click();
}

async function inviteUser(page: Page, username: string): Promise<void> {
  await page.getByRole('button', { name: 'Invite' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').first().fill(username);
  await dialog.getByRole('button', { name: /Invite/ }).click();
  await expectToast(page, /invit/i);
}

test('the table lists requests first, without emails', async ({ page }) => {
  await openCourse(page, 'Private Study Group');
  await page.getByRole('tab', { name: 'Members' }).click();
  const rows = page.getByRole('row');
  await expect(memberRow(page, 'outsider')).toContainText('Requested');
  await expect(memberRow(page, 'viewer')).toContainText('Invited');
  // Row 0 is the header.
  await expect(rows.nth(1)).toContainText('@outsider');
  await expect(page.getByRole('table')).not.toContainText('@test.com');
});

test('the owner approves a request', async ({ page }) => {
  await openCourse(page, 'Private Study Group');
  await page.getByRole('tab', { name: 'Members' }).click();
  await rowAction(page, 'outsider', 'Approve');
  await expect(memberRow(page, 'outsider')).toContainText('Active');
});

test('the owner invites a user, then cancels the invitation after a confirm', async ({ page }) => {
  await openCourse(page, 'Private Study Group');
  await page.getByRole('tab', { name: 'Members' }).click();
  await inviteUser(page, 'editor');
  await expect(memberRow(page, 'editor')).toContainText('Invited');

  await rowAction(page, 'editor', 'Cancel invitation');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel invitation' }).click();
  await expect(memberRow(page, 'editor')).toHaveCount(0);
});

test('the owner changes a role and removes a member', async ({ page }) => {
  await openCourse(page, 'Spanish Basics');
  await page.getByRole('tab', { name: 'Members' }).click();
  await expect(memberRow(page, 'viewer')).toContainText('Viewer');
  await rowAction(page, 'viewer', 'Make editor');
  await expect(memberRow(page, 'viewer')).toContainText('Editor');

  await rowAction(page, 'viewer', 'Remove member');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove member' }).click();
  await expect(memberRow(page, 'viewer')).toHaveCount(0);
});

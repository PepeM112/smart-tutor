import { type Browser, expect, type Page, test } from '@playwright/test';

import { expectToast, openCourse } from './helpers';
import { authFile, type UserKey } from './users';

const COURSE = 'Spanish Basics';

async function pageAs(browser: Browser, user: UserKey): Promise<Page> {
  const context = await browser.newContext({ storageState: authFile(user) });
  return context.newPage();
}

// One story in order: the seed leaves the course in edit mode with unpublished changes.
test.describe.configure({ mode: 'serial' });

test('a member sees the published version, not the draft', async ({ browser }) => {
  const viewer = await pageAs(browser, 'viewer');
  await openCourse(viewer, COURSE);
  await expect(viewer.getByRole('heading', { name: 'Grammar' })).toBeVisible();
  await expect(viewer.getByText('Extra (draft only)')).toHaveCount(0);
  await expect(viewer.getByRole('button', { name: 'Edit course' })).toHaveCount(0);
  await expect(viewer.getByRole('link', { name: 'Settings', exact: true })).toHaveCount(0);
});

test('a member opens a note in the preview panel', async ({ browser }) => {
  const viewer = await pageAs(browser, 'viewer');
  await openCourse(viewer, COURSE);
  await viewer.getByRole('button', { name: 'Pronouns' }).click();
  await expect(viewer.getByText('nosotros, vosotros')).toBeVisible();
  await expect(viewer.getByText('DRAFT CHANGE')).toHaveCount(0);
});

test('the owner discards the draft', async ({ browser }) => {
  const owner = await pageAs(browser, 'owner');
  await openCourse(owner, COURSE);
  await expect(owner.getByText('Extra (draft only)')).toBeVisible();
  await expect(owner.getByRole('button', { name: 'Publish' })).toBeEnabled();

  await owner.getByRole('button', { name: 'Discard draft' }).click();
  await owner.getByRole('alertdialog').getByRole('button', { name: 'Discard draft' }).click();
  await expectToast(owner, 'Draft discarded');
  await expect(owner.getByRole('button', { name: 'Edit course' })).toBeVisible();
  await expect(owner.getByText('Extra (draft only)')).toHaveCount(0);
});

test('Publish is off until a change, autosave shows Saved, publish reaches members', async ({ browser }) => {
  const owner = await pageAs(browser, 'owner');
  await openCourse(owner, COURSE);
  await owner.getByRole('button', { name: 'Edit course' }).click();
  // A draft with no changes: nothing to publish. The tooltip wrapper is not a second "Publish" button.
  const publish = owner.getByRole('button', { name: 'Publish' });
  await expect(publish).toHaveCount(1);
  await expect(publish).toBeDisabled();
  // The hover reaches the wrapper (a disabled button gets no mouse events) and shows the reason.
  await publish.hover({ force: true });
  await expect(owner.getByText('There are no changes to publish')).toBeVisible();
  await expect(owner.getByRole('dialog', { name: 'Publish the course' })).toHaveCount(0);
  await owner.keyboard.press('Escape');

  await owner.getByRole('textbox', { name: 'New section title' }).fill('E2E section');
  await owner.getByRole('button', { name: 'Add section' }).click();
  await expect(owner.getByRole('heading', { name: 'E2E section' })).toBeVisible();
  await expect(owner.getByText('Saved', { exact: true })).toBeVisible();
  await expect(publish).toBeEnabled();

  await publish.click();
  await owner.getByRole('dialog').getByRole('button', { name: 'Publish' }).click();
  await expectToast(owner, 'Course published');
  await expect(owner.getByRole('button', { name: 'Edit course' })).toBeVisible();

  const viewer = await pageAs(browser, 'viewer');
  await openCourse(viewer, COURSE);
  await expect(viewer.getByRole('heading', { name: 'E2E section' })).toBeVisible();
});

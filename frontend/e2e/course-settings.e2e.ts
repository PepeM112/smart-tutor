import { expect, test } from '@playwright/test';

import { expectToast, openCourse, pageHeading } from './helpers';
import { authFile } from './users';

test.use({ storageState: authFile('owner'), permissions: ['clipboard-read', 'clipboard-write'] });

test('the cog opens Settings, the code copies, duplicate and delete forever work', async ({ page }) => {
  await openCourse(page, 'World Geography');
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(pageHeading(page, 'Settings')).toBeVisible();

  await page.getByRole('button', { name: 'Copy code' }).click();
  await expectToast(page, /copied/i);

  await page.getByRole('button', { name: 'Duplicate course' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Title').fill('E2E Copy');
  await dialog.getByRole('button', { name: 'Duplicate course' }).click();
  await expectToast(page, 'Course duplicated');
  await expect(pageHeading(page, 'E2E Copy')).toBeVisible();
  // The copy has the published content of the source.
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Delete forever' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm.getByRole('button', { name: 'Delete forever' })).toBeDisabled();
  await confirm.getByLabel('Course title').fill('E2E Copy');
  await confirm.getByRole('button', { name: 'Delete forever' }).click();
  await expect(page).toHaveURL(/\/courses$/);
  await expect(page.getByRole('tabpanel').getByText('E2E Copy')).toHaveCount(0);
});

test('a non-owner cannot open Settings', async ({ browser }) => {
  const page = await (await browser.newContext({ storageState: authFile('editor') })).newPage();
  await openCourse(page, 'Spanish Basics');
  await expect(page.getByRole('link', { name: 'Settings', exact: true })).toHaveCount(0);
});

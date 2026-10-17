import { expect, test } from '@playwright/test';

import { expectToast, reseedCourses } from './helpers';
import { authFile } from './users';

// The viewer test accepts the seeded invitation. The file reseeds before it starts and does not need the other files.
test.beforeAll(reseedCourses);

test.describe('owner: /courses', () => {
  test.use({ storageState: authFile('owner') });

  test('My courses hides archived courses until the status filter asks for them', async ({ page }) => {
    await page.goto('/courses');
    const grid = page.getByRole('tabpanel');
    await expect(grid.getByText('Spanish Basics')).toBeVisible();
    await expect(grid.getByText('World Geography')).toBeVisible();
    await expect(grid.getByText('Draft Course')).toBeVisible();
    await expect(grid.getByText('Old Course')).toHaveCount(0);

    await page.getByRole('button', { name: 'Filters' }).click();
    await page.getByRole('dialog').getByText('Archived', { exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(grid.getByText('Old Course')).toBeVisible();
    await expect(grid.getByText('Spanish Basics')).toHaveCount(0);
  });

  test('the catalog shows public, published courses only', async ({ page }) => {
    await page.goto('/courses?tab=catalog');
    const grid = page.getByRole('tabpanel');
    await expect(grid.getByText('Intro to Chemistry')).toBeVisible();
    await expect(grid.getByText('Spanish Basics')).toBeVisible();
    await expect(grid.getByText('World Geography')).toHaveCount(0);
    await expect(grid.getByText('Draft Course')).toHaveCount(0);
    await expect(grid.getByText('Private Study Group')).toHaveCount(0);
  });
});

test.describe('viewer: invitations', () => {
  test.use({ storageState: authFile('viewer') });

  test('the Mail badge counts the invitation and Accept joins the course', async ({ page }) => {
    await page.goto('/courses');
    const mail = page.getByRole('button', { name: 'Invitations (1)' });
    await expect(mail).toBeVisible();
    await mail.click();
    await expect(page.getByRole('link', { name: 'Private Study Group' })).toBeVisible();
    await page.getByRole('button', { name: 'Accept' }).click();
    await expectToast(page, /joined/i);
    await expect(page.getByRole('button', { name: 'Invitations', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tabpanel').getByText('Private Study Group')).toBeVisible();
  });
});

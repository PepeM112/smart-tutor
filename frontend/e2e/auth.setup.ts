import { expect, test as setup } from '@playwright/test';

import { authFile, PASSWORD, type UserKey, USERS } from './users';

// Log in once per user and keep the cookies. The specs then start logged in.
(Object.keys(USERS) as UserKey[]).forEach(user => {
  setup(`log in as ${user}`, async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(USERS[user]);
    await page.locator('#password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page).not.toHaveURL(/\/login/);
    await page.context().storageState({ path: authFile(user) });
  });
});

import { expect, type Page } from '@playwright/test';

/** Open a course from the "My courses" grid by its title. */
export async function openCourse(page: Page, title: string): Promise<void> {
  await page.goto('/courses');
  await page
    .getByRole('link', { name: new RegExp(`^${title}`) })
    .first()
    .click();
  await expect(pageHeading(page, title)).toBeVisible();
}

/** The page title: the `PageHeader` breadcrumb is the only `h1` of a page. */
export function pageHeading(page: Page, name: string) {
  return page.getByRole('heading', { level: 1, name, exact: true });
}

/** A toast with this text shows. */
export async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: text }).first()).toBeVisible();
}

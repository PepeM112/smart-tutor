import { execSync } from 'node:child_process';
import path from 'node:path';

import { type BrowserContext, expect, type Page, test as base } from '@playwright/test';

import { authFile, type UserKey } from './users';

/**
 * Put the seeded courses back to their start state (the script cleans the course data of the owner).
 * Each spec file calls it in `test.beforeAll`, so the file does not depend on the writes of other files.
 * Playwright runs from `frontend/`, so the repo root is one folder up.
 */
export function reseedCourses(): void {
  execSync('bash backend/scripts/seed_courses.sh', { cwd: path.resolve(process.cwd(), '..'), stdio: 'pipe' });
}

/** `test` with a `pageAs` fixture: a page logged in as a seeded user. The fixture closes its contexts after the test. */
export const test = base.extend<{ pageAs: (user: UserKey) => Promise<Page> }>({
  // The callback is named `provide`, not `use`: ESLint reads `use(...)` as a React hook.
  pageAs: async ({ browser }, provide) => {
    const contexts: BrowserContext[] = [];
    await provide(async user => {
      const context = await browser.newContext({ storageState: authFile(user) });
      contexts.push(context);
      return context.newPage();
    });
    await Promise.all(contexts.map(context => context.close()));
  },
});

/** Open a course from the "My courses" grid by its title. */
export async function openCourse(page: Page, title: string): Promise<void> {
  await page.goto('/courses');
  await page
    .getByRole('link', { name: new RegExp(`^${title}`) })
    .first()
    .click();
  await expect(pageHeading(page, title)).toBeVisible();
}

/** Select an item of the course in the outline column (a link). The page then shows the note or the test. */
export async function openCourseItem(page: Page, title: string | RegExp): Promise<void> {
  await page.getByTestId('outline-nav').getByRole('link', { name: title }).click();
}

/** Open a classroom from the "Classrooms" grid by its title. */
export async function openClassroom(page: Page, title: string): Promise<void> {
  await page.goto('/classrooms');
  await page
    .getByRole('link', { name: new RegExp(`^${title}`) })
    .first()
    .click();
  // The page title is the tab, so the open page is known by its outline: the default tab is selected.
  await expect(classroomTab(page, 'Classwork')).toHaveAttribute('aria-current', 'page');
}

/** A tab of the classroom: a link in the outline column (the Contents drawer below `lg`). */
export function classroomTab(page: Page, name: string) {
  return page.getByTestId('outline-nav').getByRole('link', { name, exact: true });
}

/** All the tabs of the classroom that the user sees. */
export function classroomTabs(page: Page) {
  return page.getByTestId('outline-nav').getByRole('link');
}

/** The classroom in the breadcrumb of the page header (the title there is the tab). */
export function classroomCrumb(page: Page, title: string) {
  return page.getByRole('link', { name: title, exact: true }).filter({ visible: true });
}

/** The id of the space in the URL (`/classrooms/<slug>-<id>`): the last 26 characters of the path. */
export function spaceIdFromUrl(page: Page): string {
  const path = new URL(page.url()).pathname.split('/').filter(Boolean)[1] ?? '';
  return path.slice(-26);
}

/** The page title: the `PageHeader` breadcrumb is the only `h1` of a page. */
export function pageHeading(page: Page, name: string) {
  return page.getByRole('heading', { level: 1, name, exact: true });
}

/** A toast with this text shows. */
export async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: text }).first()).toBeVisible();
}

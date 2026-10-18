import { expect, type Page } from '@playwright/test';

import { expectToast, openCourse, reseedCourses, test } from './helpers';

const COURSE = 'Progress Course';
let courseId = '';
let courseSlug = '';

// One viewer story in order (audit fixes of ST-67): Review rule, Assistant block, clock, auto-submit,
// localized 409, pass, reset, copy, variant confirm. The file reseeds before it starts.
test.describe.configure({ mode: 'serial' });
test.beforeAll(reseedCourses);
// The Assistant spec gives the viewer a fake AI key. An empty key clears it, so other files see no Assistant.
test.afterAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: 'e2e/.auth/viewer.json' });
  await context.request.patch('/api/v1/users/me', { data: { anthropicApiKey: '' } });
  await context.close();
});

/** The number of course questions that Review gives for this course (practice mode ignores the due date). */
async function reviewCount(page: Page): Promise<number> {
  const response = await page.request.get(`/api/v1/review/questions?mode=practice&scope=${courseId}&limit=50`);
  expect(response.ok(), `${response.status()} ${await response.text()} ${response.url()}`).toBe(true);
  return ((await response.json()) as { questions: unknown[] }).questions.length;
}

function attemptInfo(page: Page) {
  return page.getByTestId('test-attempt-info');
}

async function startFromCourse(page: Page): Promise<void> {
  await openCourse(page, COURSE);
  await page.getByRole('link', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'Start test' }).click();
  await expect(page.getByTestId('exam-countdown')).toBeVisible();
}

async function variantAnswer(page: Page): Promise<string> {
  return (await page.getByText('Variant A: type alpha').isVisible()) ? 'alpha' : 'beta';
}

test('Include in Review adds nothing from an AFTER_PASS_OR_LAST test before a pass', async ({ pageAs }) => {
  const viewer = await pageAs('viewer');
  await openCourse(viewer, COURSE);
  courseSlug = viewer.url().split('/courses/')[1].split(/[/?]/)[0];
  // The slug ends with the course id (a 26-character ULID).
  courseId = courseSlug.slice(-26);

  await viewer.getByRole('button', { name: 'More actions' }).click();
  await viewer.getByRole('menuitem', { name: 'Include in Review' }).click();
  await expectToast(viewer, 'Course questions added to Review');
  expect(await reviewCount(viewer)).toBe(0);

  await viewer.goto('/review');
  await expect(viewer.getByRole('combobox')).toContainText(COURSE);
});

test('the Assistant is hidden and refused during an attempt', async ({ pageAs }) => {
  const viewer = await pageAs('viewer');
  // A fake key makes the Assistant available (local e2e DB only). No request reaches a provider.
  const keySaved = await viewer.request.patch('/api/v1/users/me', { data: { anthropicApiKey: 'sk-ant-e2e-fake' } });
  expect(keySaved.ok()).toBe(true);

  await openCourse(viewer, COURSE);
  const launcher = viewer.getByRole('button', { name: 'Open AI Assistant' });
  await expect(launcher).toBeVisible();

  await viewer.getByRole('link', { name: 'Start', exact: true }).click();
  await viewer.getByRole('button', { name: 'Start test' }).click();
  await expect(viewer.getByTestId('exam-countdown')).toBeVisible();
  await expect(launcher).toHaveCount(0);

  const refused = await viewer.request.post('/api/v1/assist', {
    data: { messages: [{ role: 'user', content: 'hi' }] },
  });
  expect(refused.status()).toBe(409);
  expect(((await refused.json()) as { detail: string }).detail).toBe(
    'The assistant is not available during a course test'
  );
});

test('the countdown uses the server clock and auto-submits at the deadline', async ({ pageAs }) => {
  const viewer = await pageAs('viewer');
  // The client clock is 10 minutes slow. Without the server offset the timer would show about 40 min.
  await viewer.clock.install({ time: Date.now() - 10 * 60_000 });
  await openCourse(viewer, COURSE);
  await viewer.getByRole('link', { name: 'Resume', exact: true }).click();
  const countdown = viewer.getByTestId('exam-countdown');
  await expect(countdown).toBeVisible();
  await expect(countdown).toContainText(/2\d:\d\d/);

  await viewer.clock.fastForward('31:00');
  await expect(viewer).toHaveURL(/\/history\/.+/);
});

test('a refused start shows the Spanish text', async ({ pageAs, browser }) => {
  // Tab A (Spanish) waits on the start card while tab B uses the last attempt.
  const context = await browser.newContext({ storageState: 'e2e/.auth/viewer.json' });
  await context.addCookies([{ name: 'locale', value: 'es', url: 'http://localhost:3000' }]);
  const spanish = await context.newPage();
  await spanish.goto(`/courses/${courseSlug}`);
  await spanish.getByRole('link', { name: 'Empezar', exact: true }).click();
  await expect(spanish.getByTestId('attempt-start-card')).toBeVisible();

  const viewer = await pageAs('viewer');
  await startFromCourse(viewer);
  await viewer
    .getByPlaceholder('Type your answer')
    .first()
    .fill(await variantAnswer(viewer));
  await viewer.getByRole('button', { name: 'Submit Exam' }).click();
  await expect(viewer).toHaveURL(/\/history\/.+/);

  await spanish.getByRole('button', { name: 'Empezar test' }).click();
  await expectToast(spanish, 'Sin intentos');
  await context.close();
});

test('after the pass, Review gives the course questions', async ({ pageAs }) => {
  const viewer = await pageAs('viewer');
  await openCourse(viewer, COURSE);
  await expect(attemptInfo(viewer)).toContainText('Best: 100%');
  expect(await reviewCount(viewer)).toBeGreaterThan(0);
});

test('the owner asks before removing a variant, and a reset gives the viewer a new start', async ({ pageAs }) => {
  const owner = await pageAs('owner');
  await openCourse(owner, COURSE);
  await owner.getByRole('button', { name: 'Edit course' }).click();
  await owner.getByRole('button', { name: 'Attempt rules' }).click();
  const settings = owner.getByTestId('test-settings');
  await expect(settings).toBeVisible();

  await settings.getByRole('button', { name: 'Remove variant' }).first().click();
  const confirm = owner.getByRole('alertdialog');
  await expect(confirm).toContainText('Remove this variant?');
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(settings.getByTestId('variant-list').getByRole('listitem')).toHaveCount(2);

  const saved = owner.waitForResponse(response => response.request().method() === 'PATCH' && response.ok());
  const threshold = settings.getByLabel('Pass threshold (%)');
  await threshold.fill('60');
  await threshold.blur();
  await saved;

  await owner.getByRole('button', { name: 'Publish' }).click();
  const dialog = owner.getByRole('dialog');
  await dialog.getByRole('checkbox').last().check();
  await dialog.getByRole('button', { name: 'Publish' }).click();
  await expectToast(owner, 'Course published');

  const viewer = await pageAs('viewer');
  await openCourse(viewer, COURSE);
  await expect(attemptInfo(viewer)).toContainText('2 of 2 attempts left');
  await expect(attemptInfo(viewer)).not.toContainText('Best');
  await expect(viewer.getByTestId('item-progress').last()).toHaveAttribute('data-done', 'false');
  expect(await reviewCount(viewer)).toBe(0);
});

test('a copied note shows in the Files tree at once', async ({ pageAs }) => {
  const viewer = await pageAs('viewer');
  const copies = viewer.getByRole('treegrid', { name: 'Files' }).getByRole('row', { name: /Intro note/ });
  // Load the Files tree first, so that the cache has a tree without the new copy.
  await viewer.goto('/files');
  await expect(viewer.getByRole('treegrid', { name: 'Files' }).getByRole('row').nth(1)).toBeVisible();
  const before = await copies.count();

  await openCourse(viewer, COURSE);
  await viewer
    .getByRole('button', { name: /Intro note/ })
    .first()
    .click();
  const copied = viewer.waitForResponse(response => response.url().includes('/copy-to-library') && response.ok());
  await viewer.getByRole('button', { name: 'Copy to my library' }).click();
  const copy = (await (await copied).json()) as { id: string };
  await expectToast(viewer, 'Copied to your library');

  // A client-side link uses the cache: the tree must show the copy without a reload (F8).
  await viewer.getByRole('link', { name: 'Files', exact: true }).click();
  await expect(copies).toHaveCount(before + 1);

  // Remove the copy (Trash, then delete for good), so that the next run starts clean.
  expect((await viewer.request.delete(`/api/v1/notes/${copy.id}`)).ok()).toBe(true);
  expect((await viewer.request.delete(`/api/v1/trash/note/${copy.id}`)).ok()).toBe(true);
});

import { expect, type Page, test } from '@playwright/test';

import { openCourse, reseedCourses } from './helpers';
import { authFile } from './users';

const COURSE = 'Progress Course';

type Variant = 'alpha' | 'beta';
// The variant of attempt 1. Attempt 2 must get the other one.
let firstVariant: Variant | null = null;

// The tests share one viewer progress in order (mark, attempt 1, attempt 2). The file reseeds before it starts.
test.use({ storageState: authFile('viewer') });
test.describe.configure({ mode: 'serial' });
test.beforeAll(reseedCourses);

function noteRow(page: Page) {
  return page.getByRole('button', { name: /Intro note/ }).first();
}

function attemptInfo(page: Page) {
  return page.getByTestId('test-attempt-info');
}

/**
 * Start or resume the attempt from the course page, then wait for the exam.
 * A new attempt shows the start card first (F7) and starts only on "Start test". A resume opens at once.
 */
async function openAttempt(page: Page, label: 'Start' | 'Resume'): Promise<void> {
  await openCourse(page, COURSE);
  await page.getByRole('link', { name: label, exact: true }).click();
  if (label === 'Start') await page.getByRole('button', { name: 'Start test' }).click();
  await expect(page.getByTestId('exam-countdown')).toBeVisible();
}

/** The variant prompt that the attempt shows: "alpha" or "beta". */
async function variantOf(page: Page): Promise<Variant> {
  const isAlpha = await page.getByText('Variant A: type alpha').isVisible();
  return isAlpha ? 'alpha' : 'beta';
}

async function submitExam(page: Page, answer: string): Promise<void> {
  await page.getByPlaceholder('Type your answer').first().fill(answer);
  await page.getByRole('button', { name: 'Submit Exam' }).click();
  await expect(page).toHaveURL(/\/history\/.+/);
}

test('the course starts at 0 % and the viewer marks a note complete and not done', async ({ page }) => {
  await openCourse(page, COURSE);
  await expect(page.getByTestId('course-progress').first()).toContainText('0%');
  await expect(page.getByTestId('item-progress').first()).toHaveAttribute('data-done', 'false');

  await noteRow(page).click();
  await page.getByRole('button', { name: 'Mark complete' }).click();
  await expect(page.getByRole('button', { name: 'Mark as not done' })).toBeVisible();
  await expect(page.getByTestId('course-progress').first()).toContainText('33%');
  await expect(page.getByTestId('item-progress').first()).toHaveAttribute('data-done', 'true');

  await page.getByRole('button', { name: 'Mark as not done' }).click();
  await expect(page.getByRole('button', { name: 'Mark complete' })).toBeVisible();
  await expect(page.getByTestId('course-progress').first()).toContainText('0%');
});

test('the test row shows the policy before the first attempt', async ({ page }) => {
  await openCourse(page, COURSE);
  await expect(attemptInfo(page)).toContainText('2 of 2 attempts left');
  await expect(attemptInfo(page)).toContainText('30 min');
});

test('opening the attempt page starts nothing until the student presses Start test', async ({ page }) => {
  await openCourse(page, COURSE);
  await page.getByRole('link', { name: 'Start', exact: true }).click();

  const card = page.getByTestId('attempt-start-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Time limit: 30 min');
  await expect(card).toContainText('2 of 2 attempts left');
  await expect(page.getByTestId('exam-countdown')).toHaveCount(0);

  // A reload shows the card again: the page did not start an attempt.
  await page.reload();
  await expect(page.getByTestId('attempt-start-card')).toBeVisible();
  await expect(page.getByTestId('exam-countdown')).toHaveCount(0);

  await openCourse(page, COURSE);
  await expect(attemptInfo(page)).toContainText('2 of 2 attempts left');
});

test('an attempt keeps its answers after a reload, then submit opens the result', async ({ page }) => {
  await openAttempt(page, 'Start');
  const first = await variantOf(page);
  firstVariant = first;
  const input = page.getByPlaceholder('Type your answer').first();
  await input.fill('draft answer');

  await page.reload();
  await expect(page.getByTestId('exam-countdown')).toBeVisible();
  await expect(page.getByPlaceholder('Type your answer').first()).toHaveValue('draft answer');
  expect(await variantOf(page)).toBe(first);

  await submitExam(page, first);
  await expect(page.getByText(/100/).first()).toBeVisible();
});

test('attempts left goes down and the second attempt gets the other variant', async ({ page }) => {
  await openCourse(page, COURSE);
  await expect(attemptInfo(page)).toContainText('1 of 2 attempts left');
  await expect(attemptInfo(page)).toContainText('Best: 100%');

  await page.getByRole('link', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'Start test' }).click();
  await expect(page.getByTestId('exam-countdown')).toBeVisible();
  const second = await variantOf(page);
  expect(second).not.toBe(firstVariant);
  await submitExam(page, second);

  await openCourse(page, COURSE);
  await expect(attemptInfo(page)).toContainText('0 of 2 attempts left');
  await expect(page.getByRole('button', { name: 'No attempts left' })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Start', exact: true })).toHaveCount(0);
});

test('Continue skips a test that is done and opens the first item that is not done', async ({ page }) => {
  // The test was passed and has no attempt left, and the visit made it the last item. The note is not done.
  await openCourse(page, COURSE);
  await expect(page.getByTestId('item-progress').last()).toHaveAttribute('data-done', 'true');

  await page.getByRole('button', { name: 'Continue' }).click();

  // No attempt page, no new attempt: the note opens in the preview.
  await expect(page).not.toHaveURL(/\/tests\//);
  await expect(page.getByRole('button', { name: 'Mark complete' })).toBeVisible();
});

// The seed has a "Long note" (about 40 parts) in "Progress Course", taller than the screen.
test('the full note page does not mark the note done before the student scrolls (F2)', async ({ page }) => {
  await openCourse(page, COURSE);
  await page.getByRole('button', { name: /Long note/ }).click();
  await page.getByRole('link', { name: 'Open' }).click();

  const marker = page.getByRole('button', { name: 'Mark complete' });
  await expect(marker).toBeVisible();
  // No scroll yet: it stays not done, even after the editor has its content.
  await page.waitForTimeout(1000);
  await expect(marker).toBeVisible();

  await page.getByTestId('note-end-sentinel').scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Mark as not done' })).toBeVisible();
});

// The seed gives the viewer one result on a snapshot (the test was edited after it). The course attempts
// above are on the current version, so they add no icon: the count stays 1.
test('the history table marks only the result of an older test version with the icon (F21)', async ({ page }) => {
  await page.goto('/history');
  await expect(page.getByRole('row').nth(1)).toBeVisible();
  await expect(page.getByTestId('older-version')).toHaveCount(1);
});

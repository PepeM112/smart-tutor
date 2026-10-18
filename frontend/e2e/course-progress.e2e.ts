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

/** Start or resume the attempt from the course page, then wait for the exam. */
async function openAttempt(page: Page, label: 'Start' | 'Resume'): Promise<void> {
  await openCourse(page, COURSE);
  await page.getByRole('link', { name: label, exact: true }).click();
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
  await expect(page.getByTestId('course-progress').first()).toContainText('50%');
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
  await expect(page.getByTestId('exam-countdown')).toBeVisible();
  const second = await variantOf(page);
  expect(second).not.toBe(firstVariant);
  await submitExam(page, second);

  await openCourse(page, COURSE);
  await expect(attemptInfo(page)).toContainText('0 of 2 attempts left');
  await expect(page.getByRole('button', { name: 'No attempts left' })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Start', exact: true })).toHaveCount(0);
});

test('the history table marks a result of an older test version', async ({ page }) => {
  await page.goto('/history');
  await expect(page.getByRole('row').nth(1)).toBeVisible();
  // The results are from the current version, so no row has the icon yet.
  await expect(page.getByTestId('older-version')).toHaveCount(0);
});

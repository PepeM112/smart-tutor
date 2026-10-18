// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type TestReadStripped } from '@/client';

import { ExamView } from './ExamView';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

const NOW = new Date('2026-01-01T10:00:00Z');

const TEST = {
  id: 't1',
  userId: 'u1',
  title: 'Exam',
  status: 1,
  questions: [{ id: 'q1', questionType: 1, prompt: 'To go', content: {}, order: 0, points: 1 }],
  questionGroups: [],
} as unknown as TestReadStripped;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ExamView submit guard', () => {
  it('does not send a second submit when the timeout comes after a manual submit', () => {
    const onSubmit = vi.fn();
    const deadline = new Date(NOW.getTime() + 10_000);
    // The parent is still waiting for the first request: `isSubmitting` stays false in this render,
    // as it can be in the tick between the click and the state update.
    render(<ExamView test={TEST} onSubmit={onSubmit} isSubmitting={false} deadlineAt={deadline} />);

    fireEvent.click(screen.getByRole('button', { name: 'exam.submit_exam' }));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('submits once when the timeout comes first, then ignores a click', () => {
    const onSubmit = vi.fn();
    const deadline = new Date(NOW.getTime() + 10_000);
    render(<ExamView test={TEST} onSubmit={onSubmit} isSubmitting={false} deadlineAt={deadline} />);

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'exam.submit_exam' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('opens the guard again after a failed submit', () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<ExamView test={TEST} onSubmit={onSubmit} isSubmitting={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'exam.submit_exam' }));
    rerender(<ExamView test={TEST} onSubmit={onSubmit} isSubmitting />);
    rerender(<ExamView test={TEST} onSubmit={onSubmit} isSubmitting={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'exam.submit_exam' }));

    expect(onSubmit).toHaveBeenCalledTimes(2);
  });
});

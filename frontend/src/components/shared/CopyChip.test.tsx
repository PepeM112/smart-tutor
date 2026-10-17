// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CopyChip } from './CopyChip';

const mocks = vi.hoisted(() => ({ copyText: vi.fn() }));
vi.mock('@/lib/copyText', () => ({ copyText: mocks.copyText }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CopyChip', () => {
  it('copies the text with the common "Copied" messages', async () => {
    mocks.copyText.mockResolvedValue(true);
    render(<CopyChip text="ABC123" label="Copy code" />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));

    expect(mocks.copyText).toHaveBeenCalledWith('ABC123', { copied: 'copied', failed: 'failed_to_copy' });
    await waitFor(() => expect(document.querySelector('.lucide-check')).toBeTruthy());
  });

  it('keeps the copy icon when the copy fails', async () => {
    mocks.copyText.mockResolvedValue(false);
    render(<CopyChip text="ABC123" />);

    fireEvent.click(screen.getByRole('button', { name: 'copy ABC123' }));
    // Let the copy promise settle before the check.
    await waitFor(() => expect(mocks.copyText).toHaveBeenCalled());
    await Promise.resolve();

    expect(document.querySelector('.lucide-check')).toBeNull();
    expect(document.querySelector('.lucide-copy')).toBeTruthy();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import { copyCode } from './copyCode';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const messages = { copied: 'Copied', failed: 'Failed' };

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('copyCode', () => {
  it('writes the text and shows the success toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await expect(copyCode('a = 1', messages)).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('a = 1');
    expect(toast.success).toHaveBeenCalledWith('Copied');
  });

  it('shows the error toast when the clipboard refuses', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });

    await expect(copyCode('a = 1', messages)).resolves.toBe(false);
    expect(toast.error).toHaveBeenCalledWith('Failed');
    expect(toast.success).not.toHaveBeenCalled();
  });
});

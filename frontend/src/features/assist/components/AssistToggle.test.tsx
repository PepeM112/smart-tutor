// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAssistHiddenStore } from '../store/useAssistHiddenStore';
import { useAssistPanelStore } from '../store/useAssistPanelStore';

import { AssistToggle } from './AssistToggle';

const aiAvailable = vi.hoisted(() => ({ value: true }));

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/hooks/useAiAvailable', () => ({ useAiAvailable: () => aiAvailable.value }));

beforeEach(() => {
  aiAvailable.value = true;
  useAssistPanelStore.setState({ isOpen: false, widths: {} });
  useAssistHiddenStore.setState({ hiders: 0 });
});
afterEach(cleanup);

describe('AssistToggle', () => {
  it('shows a pressed state that follows the sheet', () => {
    render(<AssistToggle />);
    const button = screen.getByRole('button', { name: 'title' });
    expect(button.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(button);

    expect(useAssistPanelStore.getState().isOpen).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('closes an open sheet', () => {
    useAssistPanelStore.setState({ isOpen: true });
    render(<AssistToggle />);

    fireEvent.click(screen.getByRole('button', { name: 'title' }));

    expect(useAssistPanelStore.getState().isOpen).toBe(false);
  });

  it('is not rendered without an AI key', () => {
    aiAvailable.value = false;
    render(<AssistToggle />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('is not rendered while a page hides the Assistant', () => {
    useAssistHiddenStore.setState({ hiders: 1 });
    render(<AssistToggle />);

    expect(screen.queryByRole('button')).toBeNull();
  });
});

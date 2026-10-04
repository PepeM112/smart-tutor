// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type UserRead } from '@/client';
import { useAuthStore } from '@/features/auth/store/authStore';
import { sdk } from '@/lib/apiClient';

import { SettingsPage } from './SettingsPage';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/apiClient', () => ({
  sdk: { usersUpdateMe: vi.fn(), usersUpdateAiToolPermissions: vi.fn() },
}));
vi.mock('@/features/assist/hooks/useAiToolPermissions', () => ({
  AI_PERMISSIONS_QUERY_KEY: ['ai-tool-permissions'],
  useAiToolPermissions: () => ({ data: [], isLoading: false, isError: false }),
}));
// These sections save on their own (theme, locale) and are not part of the form.
vi.mock('./AppearanceSection', () => ({ AppearanceSection: () => null }));
vi.mock('./LanguageSection', () => ({ LanguageSection: () => null }));

const USER = {
  id: 'u1',
  username: 'jose',
  email: 'jose@example.com',
  displayName: 'Jose',
  initialEaseFactor: 2.5,
  dailyReviewLimit: null,
} as UserRead;

beforeEach(() => {
  useAuthStore.setState({ user: USER });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function mount() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SettingsPage />
    </QueryClientProvider>
  );
}

const saveButton = () => screen.getByRole('button', { name: 'common.save' });
const nameInput = () => document.getElementById('displayName') as HTMLInputElement;
// `:disabled` also matches a control inside a disabled `fieldset` (the `disabled` property does not).
const isDisabled = (element: Element): boolean => element.matches(':disabled');
/** TanStack Query sends its state changes in a `setTimeout(0)` batch. */
const flush = () => act(() => new Promise(resolve => setTimeout(resolve, 0)));

describe('SettingsPage', () => {
  // Regression: any edit set a "dirty" flag, so a value changed and then changed back still enabled Save.
  it('disables Save again when a field gets back its saved value', () => {
    mount();
    expect(isDisabled(saveButton())).toBe(true);

    fireEvent.change(nameInput(), { target: { value: 'Pepe' } });
    expect(isDisabled(saveButton())).toBe(false);

    fireEvent.change(nameInput(), { target: { value: 'Jose' } });
    expect(isDisabled(saveButton())).toBe(true);
  });

  // Regression: an edit made during the save was not in the request, and the response overwrote it.
  it('makes the form read-only while the save runs', async () => {
    let finishSave: (value: { data: UserRead }) => void = () => undefined;
    vi.mocked(sdk.usersUpdateMe).mockReturnValue(
      new Promise(resolve => {
        finishSave = resolve;
      }) as never
    );
    mount();

    fireEvent.change(nameInput(), { target: { value: 'Pepe' } });
    fireEvent.click(saveButton());
    await flush();
    expect(isDisabled(nameInput())).toBe(true);

    finishSave({ data: { ...USER, displayName: 'Pepe' } });
    await waitFor(() => expect(isDisabled(nameInput())).toBe(false));
    expect(nameInput().value).toBe('Pepe');
    expect(isDisabled(saveButton())).toBe(true);
  });
});

// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type AiToolPermissionRead, type UserRead } from '@/client';
import { useAuthStore } from '@/features/auth/store/authStore';
import { sdk } from '@/lib/apiClient';

import { SettingsPage } from './SettingsPage';

vi.mock('next-intl', () => ({ useTranslations: () => Object.assign((key: string) => key, { has: () => false }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/apiClient', () => ({
  sdk: { usersUpdateMe: vi.fn(), usersUpdateAiToolPermissions: vi.fn() },
}));
// The permissions the mocked query returns. A test can set its own list.
const serverPermissions = vi.hoisted((): { current: AiToolPermissionRead[] } => ({ current: [] }));
vi.mock('@/features/assist/hooks/useAiToolPermissions', () => ({
  AI_PERMISSIONS_QUERY_KEY: ['ai-tool-permissions'],
  useAiToolPermissions: () => ({ data: serverPermissions.current, isLoading: false, isError: false }),
}));
// These sections save on their own (theme, locale) and are not part of the form.
vi.mock('./AppearanceSection', () => ({ AppearanceSection: () => null }));
vi.mock('./LanguageSection', () => ({ LanguageSection: () => null }));

// The tab is in the URL. This mock keeps the query string in a variable, and `replace` updates it.
const nav = vi.hoisted(() => ({ query: '' }));
const replace = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/settings',
  useSearchParams: () => new URLSearchParams(nav.query),
}));

const USER = {
  id: 'u1',
  username: 'jose',
  email: 'jose@example.com',
  displayName: 'Jose',
  initialEaseFactor: 2.5,
  dailyReviewLimit: null,
} as UserRead;

const permission = (name: string, autoApprove: boolean): AiToolPermissionRead => ({
  name,
  kind: 'read',
  defaultAutoApprove: false,
  autoApprove,
});

beforeEach(() => {
  useAuthStore.setState({ user: USER });
  serverPermissions.current = [];
  nav.query = '';
  replace.mockImplementation((url: string) => {
    nav.query = url.split('?')[1] ?? '';
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const queryClient = new QueryClient();
const ui = () => (
  <QueryClientProvider client={queryClient}>
    <SettingsPage />
  </QueryClientProvider>
);

/** Renders the page. The `tab` argument is the `?tab=` value in the URL. */
function mount(tab?: string) {
  nav.query = tab ? `tab=${tab}` : '';
  return render(ui());
}

/** Clicks a tab. The mocked router stores the new URL, so a re-render shows the new tab. */
function openTab(name: string, rerender: (ui: React.ReactElement) => void) {
  // A tab with unsaved changes has the dot label in its name, so the name is a prefix match.
  const tab = screen.getByRole('tab', { name: new RegExp(`^${name}`) });
  fireEvent.mouseDown(tab, { button: 0 });
  fireEvent.click(tab);
  rerender(ui());
}

const saveButton = () => screen.getByRole('button', { name: 'common.save' });
const nameInput = () => document.getElementById('displayName') as HTMLInputElement;
// `:disabled` also matches a control inside a disabled `fieldset` (the `disabled` property does not).
const isDisabled = (element: Element): boolean => element.matches(':disabled');
/** TanStack Query sends its state changes in a `setTimeout(0)` batch. */
const flush = () => act(() => new Promise(resolve => setTimeout(resolve, 0)));

describe('SettingsPage', () => {
  describe('tabs', () => {
    it('opens the profile tab by default and for an unknown value', () => {
      mount('nope');
      expect(screen.getByRole('tab', { name: 'settings.tab_profile' }).getAttribute('aria-selected')).toBe('true');
      expect(nameInput()).not.toBeNull();
    });

    it('opens the tab from the URL', () => {
      mount('srs');
      expect(screen.getByRole('tab', { name: 'settings.tab_srs' }).getAttribute('aria-selected')).toBe('true');
      expect(nameInput()).toBeNull();
    });

    it('writes the tab to the URL with replace and without a scroll', () => {
      const { rerender } = mount();
      openTab('settings.tab_ai', rerender);
      expect(replace).toHaveBeenCalledWith('/settings?tab=ai', { scroll: false });
    });

    it('keeps the draft when the user changes tabs, shows a dot on the changed tab, and saves it', async () => {
      vi.mocked(sdk.usersUpdateMe).mockResolvedValue({ data: { ...USER, displayName: 'Pepe' } } as never);
      const { rerender } = mount();
      const dot = () => screen.queryAllByRole('img', { name: 'settings.unsaved_changes' });
      expect(dot()).toHaveLength(0);

      fireEvent.change(nameInput(), { target: { value: 'Pepe' } });
      expect(dot()).toHaveLength(1);

      openTab('settings.tab_srs', rerender);
      expect(nameInput()).toBeNull();
      // The dot stays on the profile tab, so the changed tab is visible from another tab.
      expect(screen.getByRole('tab', { name: /settings.tab_profile/ }).querySelector('[role="img"]')).not.toBeNull();

      openTab('settings.tab_profile', rerender);
      expect(nameInput().value).toBe('Pepe');

      // Save is shared: it works from a tab other than the changed one.
      openTab('settings.tab_srs', rerender);
      fireEvent.click(saveButton());
      await waitFor(() => expect(sdk.usersUpdateMe).toHaveBeenCalledWith({ body: { displayName: 'Pepe' } }));
      await waitFor(() => expect(dot()).toHaveLength(0));
    });
  });

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

  describe('AI permissions', () => {
    const switches = () => screen.getAllByRole('switch');
    const groupCheckbox = () => screen.getByRole('checkbox');

    beforeEach(() => {
      serverPermissions.current = [permission('list_tests', true), permission('get_test_details', false)];
    });

    // The group checkbox is the only control with a native mixed state.
    it('shows the mixed state, then allows all tools, then turns all tools off', () => {
      mount('ai');
      expect(groupCheckbox().getAttribute('aria-checked')).toBe('mixed');

      fireEvent.click(groupCheckbox());
      expect(switches().map(s => s.getAttribute('aria-checked'))).toEqual(['true', 'true']);
      expect(groupCheckbox().getAttribute('aria-checked')).toBe('true');

      fireEvent.click(groupCheckbox());
      expect(switches().map(s => s.getAttribute('aria-checked'))).toEqual(['false', 'false']);
      expect(groupCheckbox().getAttribute('aria-checked')).toBe('false');
    });

    it('enables Save for a changed tool, and disables it again when the change is undone', () => {
      mount('ai');
      expect(isDisabled(saveButton())).toBe(true);

      fireEvent.click(switches()[1]);
      expect(isDisabled(saveButton())).toBe(false);

      fireEvent.click(switches()[1]);
      expect(isDisabled(saveButton())).toBe(true);
    });

    it('sends only the changed tools when the user selects all', async () => {
      vi.mocked(sdk.usersUpdateAiToolPermissions).mockResolvedValue({ data: [] } as never);
      mount('ai');

      fireEvent.click(groupCheckbox());
      fireEvent.click(saveButton());

      await waitFor(() =>
        expect(sdk.usersUpdateAiToolPermissions).toHaveBeenCalledWith({
          body: { permissions: { get_test_details: true } },
        })
      );
    });

    it('shows an error toast and keeps the change when the save fails', async () => {
      vi.mocked(sdk.usersUpdateAiToolPermissions).mockRejectedValue(new Error('network'));
      mount('ai');

      fireEvent.click(switches()[1]);
      fireEvent.click(saveButton());

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('settings.failed_to_save'));
      expect(toast.success).not.toHaveBeenCalled();
      // The draft stays, so the user can try again.
      await waitFor(() => expect(isDisabled(saveButton())).toBe(false));
      expect(switches()[1].getAttribute('aria-checked')).toBe('true');
    });
  });
});

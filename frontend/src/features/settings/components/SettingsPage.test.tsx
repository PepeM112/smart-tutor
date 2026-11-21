// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AiEffort, AiProvider, AnthropicModel, type AiToolPermissionRead, type UserRead } from '@/client';
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
  anthropicModel: AnthropicModel.CLAUDE_HAIKU_5_5,
  aiEffort: {
    grading: AiEffort.MEDIUM,
    challenge: AiEffort.MEDIUM,
    noteGeneration: AiEffort.MEDIUM,
    noteEdit: AiEffort.MEDIUM,
    testGeneration: AiEffort.MEDIUM,
    assistantChat: AiEffort.MEDIUM,
  },
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

const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
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
  const tab = screen.getByRole('tab', { name });
  fireEvent.mouseDown(tab, { button: 0 });
  fireEvent.click(tab);
  rerender(ui());
}

const nameInput = () => document.getElementById('displayName') as HTMLInputElement;
const easeInput = () => document.getElementById('initialEaseFactor') as HTMLInputElement;
const limitInput = () => document.getElementById('dailyReviewLimit') as HTMLInputElement;

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
  });

  it('has no Save button on any tab', () => {
    const { rerender } = mount();
    ['settings.tab_profile', 'settings.tab_ai', 'settings.tab_srs'].forEach(name => {
      openTab(name, rerender);
      expect(screen.queryByRole('button', { name: 'common.save' })).toBeNull();
    });
  });

  describe('save on blur', () => {
    it('saves the display name when the value changed', async () => {
      vi.mocked(sdk.usersUpdateMe).mockResolvedValue({ data: { ...USER, displayName: 'Pepe' } } as never);
      mount();

      fireEvent.change(nameInput(), { target: { value: 'Pepe' } });
      expect(sdk.usersUpdateMe).not.toHaveBeenCalled();
      fireEvent.blur(nameInput());

      await waitFor(() => expect(sdk.usersUpdateMe).toHaveBeenCalledWith({ body: { displayName: 'Pepe' } }));
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('settings.settings_saved'));
      expect(useAuthStore.getState().user?.displayName).toBe('Pepe');
    });

    it('does not save when the value did not change, or went back to the saved one', () => {
      mount();
      fireEvent.blur(nameInput());

      fireEvent.change(nameInput(), { target: { value: 'Pepe' } });
      fireEvent.change(nameInput(), { target: { value: 'Jose' } });
      fireEvent.blur(nameInput());

      expect(sdk.usersUpdateMe).not.toHaveBeenCalled();
    });

    it('shows an error toast when the save fails', async () => {
      vi.mocked(sdk.usersUpdateMe).mockRejectedValue(new Error('network'));
      mount();

      fireEvent.change(nameInput(), { target: { value: 'Pepe' } });
      fireEvent.blur(nameInput());

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('settings.failed_to_save'));
      expect(toast.success).not.toHaveBeenCalled();
    });

    it('saves the SRS values, and skips an empty or unchanged value', async () => {
      vi.mocked(sdk.usersUpdateMe).mockResolvedValue({ data: USER } as never);
      mount('srs');

      fireEvent.change(easeInput(), { target: { value: '' } });
      fireEvent.blur(easeInput());
      fireEvent.change(easeInput(), { target: { value: '2.5' } });
      fireEvent.blur(easeInput());
      expect(sdk.usersUpdateMe).not.toHaveBeenCalled();

      fireEvent.change(easeInput(), { target: { value: '3' } });
      fireEvent.blur(easeInput());
      await waitFor(() => expect(sdk.usersUpdateMe).toHaveBeenCalledWith({ body: { initialEaseFactor: 3 } }));

      fireEvent.change(limitInput(), { target: { value: '25' } });
      fireEvent.blur(limitInput());
      await waitFor(() => expect(sdk.usersUpdateMe).toHaveBeenCalledWith({ body: { dailyReviewLimit: 25 } }));
    });
  });

  describe('AI provider and keys', () => {
    it('saves the provider when the user picks one', async () => {
      vi.mocked(sdk.usersUpdateMe).mockResolvedValue({ data: { ...USER, aiProvider: AiProvider.OPENAI } } as never);
      mount('ai');

      fireEvent.click(screen.getByRole('button', { name: /^settings.openai/ }));

      await waitFor(() => expect(sdk.usersUpdateMe).toHaveBeenCalledWith({ body: { aiProvider: AiProvider.OPENAI } }));
    });

    it('saves a key only with its Save key button, then clears the field', async () => {
      vi.mocked(sdk.usersUpdateMe).mockResolvedValue({ data: USER } as never);
      mount('ai');
      const keyInput = document.getElementById('anthropicKey') as HTMLInputElement;
      const [saveAnthropicKey, saveOpenaiKey] = screen.getAllByRole('button', { name: 'settings.save_key' });
      expect(saveAnthropicKey.hasAttribute('disabled')).toBe(true);

      fireEvent.change(keyInput, { target: { value: 'sk-test' } });
      fireEvent.blur(keyInput);
      expect(sdk.usersUpdateMe).not.toHaveBeenCalled();
      expect(saveOpenaiKey.hasAttribute('disabled')).toBe(true);

      fireEvent.click(saveAnthropicKey);

      await waitFor(() => expect(sdk.usersUpdateMe).toHaveBeenCalledWith({ body: { anthropicApiKey: 'sk-test' } }));
      await waitFor(() => expect(keyInput.value).toBe(''));
    });
  });

  describe('AI permissions', () => {
    const switches = () => screen.getAllByRole('switch');
    const groupCheckbox = () => screen.getByRole('checkbox');
    const toggleButton = () => screen.getByRole('button', { name: /^ai_permissions_group_(show|hide)$/ });
    /** The tool switches sit in a group that is closed by default. */
    const openGroup = () => fireEvent.click(toggleButton());

    beforeEach(() => {
      serverPermissions.current = [permission('list_tests', true), permission('get_test_details', false)];
      vi.mocked(sdk.usersUpdateAiToolPermissions).mockResolvedValue({ data: [] } as never);
    });

    it('keeps the tool switches hidden until the group is opened, and closes it again', () => {
      mount('ai');
      expect(toggleButton().getAttribute('aria-expanded')).toBe('false');
      expect(screen.queryAllByRole('switch')).toHaveLength(0);

      openGroup();
      expect(toggleButton().getAttribute('aria-expanded')).toBe('true');
      expect(switches()).toHaveLength(2);

      openGroup();
      expect(toggleButton().getAttribute('aria-expanded')).toBe('false');
      expect(screen.queryAllByRole('switch')).toHaveLength(0);
    });

    it('saves a tool at once when the user toggles its switch', async () => {
      mount('ai');
      openGroup();

      fireEvent.click(switches()[1]);

      await waitFor(() =>
        expect(sdk.usersUpdateAiToolPermissions).toHaveBeenCalledWith({
          body: { permissions: { get_test_details: true } },
        })
      );
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('settings.settings_saved'));
    });

    it('sends only the changed tools when the user selects all', async () => {
      mount('ai');

      fireEvent.click(groupCheckbox());

      await waitFor(() =>
        expect(sdk.usersUpdateAiToolPermissions).toHaveBeenCalledWith({
          body: { permissions: { get_test_details: true } },
        })
      );
    });

    it('shows an error toast when the save fails', async () => {
      vi.mocked(sdk.usersUpdateAiToolPermissions).mockRejectedValue(new Error('network'));
      mount('ai');
      openGroup();

      fireEvent.click(switches()[1]);

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('settings.failed_to_save'));
      expect(toast.success).not.toHaveBeenCalled();
    });
  });
});

// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AiEffort, AiProvider, AnthropicModel, type UserRead } from '@/client';
import { useAuthStore } from '@/features/auth/store/authStore';
import { sdk } from '@/lib/apiClient';

import { MODEL_LABEL_KEYS } from '../aiModel';
import { clearUnconfirmedChanges } from '../hooks/unconfirmedUserChanges';
import { SAVE_DELAY_MS } from '../hooks/useDebouncedUpdateUser';

import { AiModelSection } from './AiModelSection';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { action?: string }) =>
    values?.action ? `${key}:${values.action}` : key,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/apiClient', () => ({ sdk: { usersUpdateMe: vi.fn() } }));

const updateMe = vi.mocked(sdk.usersUpdateMe);

const EFFORT = {
  grading: AiEffort.MEDIUM,
  challenge: AiEffort.MEDIUM,
  noteGeneration: AiEffort.MEDIUM,
  noteEdit: AiEffort.MEDIUM,
  testGeneration: AiEffort.MEDIUM,
  assistantChat: AiEffort.MEDIUM,
};
const userWith = (anthropicModel: AnthropicModel): UserRead =>
  ({ id: 'u1', anthropicModel, aiEffort: EFFORT }) as UserRead;

function renderSection(provider: AiProvider | null, model: AnthropicModel): void {
  useAuthStore.setState({ user: userWith(model) });
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AiModelSection provider={provider} />
    </QueryClientProvider>
  );
}

// jsdom lacks the pointer and layout APIs that Radix Select calls when its list opens
function chooseOption(trigger: HTMLElement, optionName: string): void {
  fireEvent.keyDown(trigger, { key: 'Enter' });
  fireEvent.click(screen.getByRole('option', { name: optionName }));
}

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.scrollIntoView = () => undefined;
  window.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
});
// Only the timers that hold the save delay are faked: Radix and Testing Library need the others.
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.clearAllMocks();
  clearUnconfirmedChanges();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('AiModelSection', () => {
  it('shows the model select for Anthropic and hides it for OpenAI', () => {
    renderSection(AiProvider.ANTHROPIC, AnthropicModel.CLAUDE_HAIKU_5_5);
    expect(screen.getByLabelText('settings.ai_model')).toBeTruthy();
    cleanup();

    renderSection(AiProvider.OPENAI, AnthropicModel.CLAUDE_HAIKU_5_5);
    expect(screen.queryByLabelText('settings.ai_model')).toBeNull();
  });

  it('disables every effort select on Haiku 4.5 and says why', () => {
    renderSection(AiProvider.ANTHROPIC, AnthropicModel.CLAUDE_HAIKU_4_5_20251001);

    expect(screen.getByText('settings.ai_effort_disabled_model')).toBeTruthy();
    const selects = screen.getAllByLabelText(/^settings\.ai_effort_select:/);
    expect(selects).toHaveLength(6);
    expect(selects.every(select => select.hasAttribute('disabled'))).toBe(true);
  });

  it('disables every effort select for OpenAI and says why', () => {
    renderSection(AiProvider.OPENAI, AnthropicModel.CLAUDE_HAIKU_5_5);

    expect(screen.getByText('settings.ai_effort_disabled_openai')).toBeTruthy();
    expect(
      screen.getByLabelText<HTMLButtonElement>('settings.ai_effort_select:settings.ai_effort_action_grading').disabled
    ).toBe(true);
  });

  it('saves only the changed action', async () => {
    updateMe.mockResolvedValueOnce({
      data: { ...userWith(AnthropicModel.CLAUDE_HAIKU_5_5), aiEffort: { ...EFFORT, grading: AiEffort.LOW } },
    } as never);
    renderSection(AiProvider.ANTHROPIC, AnthropicModel.CLAUDE_HAIKU_5_5);

    chooseOption(
      screen.getByLabelText('settings.ai_effort_select:settings.ai_effort_action_grading'),
      `settings.ai_effort_level_${AiEffort.LOW}`
    );

    await advance(SAVE_DELAY_MS);

    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(updateMe).toHaveBeenCalledWith({ body: { aiEffort: { grading: AiEffort.LOW } } });
  });

  it('sends one request per action and keeps the last level of each', async () => {
    updateMe.mockResolvedValue({ data: userWith(AnthropicModel.CLAUDE_HAIKU_5_5) } as never);
    renderSection(AiProvider.ANTHROPIC, AnthropicModel.CLAUDE_HAIKU_5_5);
    const grading = screen.getByLabelText('settings.ai_effort_select:settings.ai_effort_action_grading');
    const challenge = screen.getByLabelText('settings.ai_effort_select:settings.ai_effort_action_challenge');

    chooseOption(grading, `settings.ai_effort_level_${AiEffort.LOW}`);
    chooseOption(challenge, `settings.ai_effort_level_${AiEffort.HIGH}`);
    chooseOption(grading, `settings.ai_effort_level_${AiEffort.MAX}`);
    await advance(SAVE_DELAY_MS);

    expect(updateMe.mock.calls.map(([options]) => options.body)).toEqual([
      { aiEffort: { challenge: AiEffort.HIGH } },
      { aiEffort: { grading: AiEffort.MAX } },
    ]);
  });

  it('saves the chosen model', async () => {
    updateMe.mockResolvedValueOnce({ data: userWith(AnthropicModel.CLAUDE_HAIKU_4_5_20251001) } as never);
    renderSection(AiProvider.ANTHROPIC, AnthropicModel.CLAUDE_HAIKU_5_5);

    chooseOption(
      screen.getByLabelText('settings.ai_model'),
      MODEL_LABEL_KEYS[AnthropicModel.CLAUDE_HAIKU_4_5_20251001]
    );

    await advance(SAVE_DELAY_MS);

    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(updateMe).toHaveBeenCalledWith({ body: { anthropicModel: AnthropicModel.CLAUDE_HAIKU_4_5_20251001 } });
  });

  it('puts the effort back and shows an error when the save fails', async () => {
    updateMe.mockRejectedValueOnce(new Error('boom'));
    renderSection(AiProvider.ANTHROPIC, AnthropicModel.CLAUDE_HAIKU_5_5);

    chooseOption(
      screen.getByLabelText('settings.ai_effort_select:settings.ai_effort_action_grading'),
      `settings.ai_effort_level_${AiEffort.MAX}`
    );

    await advance(SAVE_DELAY_MS);

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().user?.aiEffort.grading).toBe(AiEffort.MEDIUM);
  });

  it('sends an effort change and a model change one after the other', async () => {
    let resolveFirst: (value: never) => void = () => undefined;
    updateMe.mockImplementationOnce(() => new Promise(resolve => (resolveFirst = resolve)) as never);
    updateMe.mockResolvedValueOnce({ data: userWith(AnthropicModel.CLAUDE_HAIKU_5_5) } as never);
    renderSection(AiProvider.ANTHROPIC, AnthropicModel.CLAUDE_HAIKU_5_5);

    chooseOption(
      screen.getByLabelText('settings.ai_effort_select:settings.ai_effort_action_grading'),
      `settings.ai_effort_level_${AiEffort.LOW}`
    );
    await advance(0);
    chooseOption(
      screen.getByLabelText('settings.ai_model'),
      MODEL_LABEL_KEYS[AnthropicModel.CLAUDE_HAIKU_4_5_20251001]
    );

    await advance(SAVE_DELAY_MS);
    expect(updateMe).toHaveBeenCalledTimes(1);
    resolveFirst({ data: userWith(AnthropicModel.CLAUDE_HAIKU_5_5) } as never);
    await advance(0);
    expect(updateMe).toHaveBeenCalledTimes(2);
  });
});

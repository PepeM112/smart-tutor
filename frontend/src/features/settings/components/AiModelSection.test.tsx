// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AiEffort, AiProvider, AnthropicModel, type UserRead } from '@/client';
import { useAuthStore } from '@/features/auth/store/authStore';
import { sdk } from '@/lib/apiClient';

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

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

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
      screen.getByLabelText<HTMLSelectElement>('settings.ai_effort_select:settings.ai_effort_action_grading').disabled
    ).toBe(true);
  });

  it('saves only the changed action', async () => {
    updateMe.mockResolvedValueOnce({
      data: { ...userWith(AnthropicModel.CLAUDE_HAIKU_5_5), aiEffort: { ...EFFORT, grading: AiEffort.LOW } },
    } as never);
    renderSection(AiProvider.ANTHROPIC, AnthropicModel.CLAUDE_HAIKU_5_5);

    fireEvent.change(screen.getByLabelText('settings.ai_effort_select:settings.ai_effort_action_grading'), {
      target: { value: AiEffort.LOW },
    });

    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(updateMe).toHaveBeenCalledWith({ body: { aiEffort: { grading: AiEffort.LOW } } });
  });

  it('saves the chosen model', async () => {
    updateMe.mockResolvedValueOnce({ data: userWith(AnthropicModel.CLAUDE_HAIKU_4_5_20251001) } as never);
    renderSection(AiProvider.ANTHROPIC, AnthropicModel.CLAUDE_HAIKU_5_5);

    fireEvent.change(screen.getByLabelText('settings.ai_model'), {
      target: { value: AnthropicModel.CLAUDE_HAIKU_4_5_20251001 },
    });

    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(updateMe).toHaveBeenCalledWith({ body: { anthropicModel: AnthropicModel.CLAUDE_HAIKU_4_5_20251001 } });
  });

  it('puts the effort back and shows an error when the save fails', async () => {
    updateMe.mockRejectedValueOnce(new Error('boom'));
    renderSection(AiProvider.ANTHROPIC, AnthropicModel.CLAUDE_HAIKU_5_5);

    fireEvent.change(screen.getByLabelText('settings.ai_effort_select:settings.ai_effort_action_grading'), {
      target: { value: AiEffort.MAX },
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(useAuthStore.getState().user?.aiEffort.grading).toBe(AiEffort.MEDIUM);
  });
});

import { AiEffort, AnthropicModel, type AiEffortSettings } from '@/client';

/** The order of the model select: the default first. */
export const ANTHROPIC_MODELS: readonly AnthropicModel[] = [
  AnthropicModel.CLAUDE_HAIKU_5_5,
  AnthropicModel.CLAUDE_HAIKU_4_5_20251001,
];

export const MODEL_LABEL_KEYS: Record<AnthropicModel, string> = {
  [AnthropicModel.CLAUDE_HAIKU_5_5]: 'settings.model_haiku_5_5',
  [AnthropicModel.CLAUDE_HAIKU_4_5_20251001]: 'settings.model_haiku_4_5',
};

/** Only these models take the effort setting. Same list as `EFFORT_MODELS` in the backend. */
export const EFFORT_MODELS: ReadonlySet<AnthropicModel> = new Set([AnthropicModel.CLAUDE_HAIKU_5_5]);

export const EFFORT_LEVELS: readonly AiEffort[] = [
  AiEffort.LOW,
  AiEffort.MEDIUM,
  AiEffort.HIGH,
  AiEffort.XHIGH,
  AiEffort.MAX,
];

/** One row per AI action. The record type fails to compile when the backend adds an action. */
export const EFFORT_ACTION_LABEL_KEYS: Record<keyof AiEffortSettings, string> = {
  grading: 'settings.ai_effort_action_grading',
  challenge: 'settings.ai_effort_action_challenge',
  noteGeneration: 'settings.ai_effort_action_note_generation',
  noteEdit: 'settings.ai_effort_action_note_edit',
  testGeneration: 'settings.ai_effort_action_test_generation',
  assistantChat: 'settings.ai_effort_action_assistant_chat',
};

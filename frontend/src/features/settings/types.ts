import { type AiProvider } from '@/client';

export type SettingsForm = {
  displayName: string;
  aiProvider: AiProvider | null;
  anthropicApiKey: string;
  openaiApiKey: string;
  dailyReviewLimit: string;
  initialEaseFactor: string;
};

export type UpdateField = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) => void;

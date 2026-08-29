import { AiProvider } from '@/client';
import { useAuthStore } from '@/features/auth/store/authStore';

export function useAiAvailable(): boolean {
  const user = useAuthStore(s => s.user);
  if (!user) return false;

  const provider = user.aiProvider ?? AiProvider.ANTHROPIC;
  if (provider === AiProvider.ANTHROPIC) return user.hasAnthropicKey ?? false;
  if (provider === AiProvider.OPENAI) return user.hasOpenaiKey ?? false;
  return false;
}

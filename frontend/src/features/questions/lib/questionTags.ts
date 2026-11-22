import { sdk } from '@/lib/apiClient';

// Nested under 'questions' on purpose: every question mutation already invalidates ['questions'],
// so the tag suggestions refresh after a create, update, duplicate or delete with no extra call.
export const QUESTION_TAGS_QUERY_KEY = ['questions', 'tags'] as const;

export async function fetchQuestionTags(search: string): Promise<string[]> {
  const response = await sdk.questionsListTags({ query: { search: search || undefined } });
  return response.data ?? [];
}

// Same normalization as the backend (`normalize_tags`), so a chip shows what will be stored.
export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase();
}

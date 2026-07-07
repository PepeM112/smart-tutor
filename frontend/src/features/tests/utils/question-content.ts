import type { MultipleChoiceContent, SimpleContent } from '@/client';

export type { MultipleChoiceContent, SimpleContent };

export function isSimpleContent(content: unknown): content is SimpleContent {
  return content != null && typeof content === 'object' && 'answers' in content && Array.isArray(content.answers);
}

export function isMCContent(content: unknown): content is MultipleChoiceContent {
  return (
    content != null &&
    typeof content === 'object' &&
    'options' in content &&
    Array.isArray(content.options) &&
    'correct_indices' in content &&
    Array.isArray(content.correct_indices)
  );
}

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
    'correctIndices' in content &&
    Array.isArray(content.correctIndices)
  );
}

// MC answers are stored as comma-separated option indices, e.g. "0,2"
export function parseMcAnswer(answer: string): number[] {
  return answer ? answer.split(',').map(Number) : [];
}

export function toggleMcOption(answer: string, index: number): string {
  const selected = parseMcAnswer(answer);
  const updated = selected.includes(index) ? selected.filter(i => i !== index) : [...selected, index];
  return updated.sort((a, b) => a - b).join(',');
}

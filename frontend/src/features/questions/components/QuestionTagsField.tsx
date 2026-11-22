'use client';

import { useTranslations } from 'next-intl';

import { Autocomplete } from '@/components/shared/Autocomplete';
import { TAG_LIMITS } from '@/lib/limits';

import { fetchQuestionTags, normalizeTag, QUESTION_TAGS_QUERY_KEY } from '../lib/questionTags';

interface QuestionTagsFieldProps {
  id: string;
  value: string[];
  onChange: (tags: string[]) => void;
}

export function QuestionTagsField({ id, value, onChange }: QuestionTagsFieldProps) {
  const t = useTranslations('questions');

  return (
    <Autocomplete
      id={id}
      value={value}
      onChange={onChange}
      queryKey={QUESTION_TAGS_QUERY_KEY}
      fetchOptions={fetchQuestionTags}
      normalize={normalizeTag}
      allowCreate
      maxItems={TAG_LIMITS.maxTags}
      maxLength={TAG_LIMITS.maxChars}
      placeholder={t('tags_placeholder')}
    />
  );
}

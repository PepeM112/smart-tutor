import { LongTextLength } from '@/client';

export const LONG_TEXT_LENGTH_TIERS = [
  { value: LongTextLength.SHORT, labelKey: 'short_chars' as const, limit: 500 },
  { value: LongTextLength.MEDIUM, labelKey: 'medium_chars' as const, limit: 1800 },
  { value: LongTextLength.LONG, labelKey: 'long_chars' as const, limit: 5000 },
] as const;

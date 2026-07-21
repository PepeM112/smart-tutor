import { LongTextLength } from '@/client';

export const LONG_TEXT_LENGTH_TIERS = [
  { value: LongTextLength.SHORT, label: 'Short (~500 chars)', limit: 500 },
  { value: LongTextLength.MEDIUM, label: 'Medium (~1800 chars)', limit: 1800 },
  { value: LongTextLength.LONG, label: 'Long (~5000 chars)', limit: 5000 },
] as const;

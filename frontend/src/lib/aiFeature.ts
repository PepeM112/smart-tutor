import { AiFeature } from '@/client';

// Maps every backend AiFeature value to its display label i18n key.
// NOTE_REFINEMENT and NOTE_CHUNK_EDIT collapse into one "Note Editing" label
// for grouping/legend purposes (see docs in messages/*.json under aiFeatures).
export const AI_FEATURE_LABEL_KEYS: Record<AiFeature, string> = {
  [AiFeature.GRADING]: 'aiFeatures.grading',
  [AiFeature.CHALLENGE]: 'aiFeatures.challenge',
  [AiFeature.NOTE_GENERATION]: 'aiFeatures.noteGeneration',
  [AiFeature.NOTE_REFINEMENT]: 'aiFeatures.noteEditing',
  [AiFeature.NOTE_CHUNK_EDIT]: 'aiFeatures.noteEditing',
  [AiFeature.TEST_GENERATION]: 'aiFeatures.testGeneration',
  [AiFeature.ASSIST]: 'aiFeatures.assist',
  [AiFeature.EMBEDDING]: 'aiFeatures.embedding',
};

// Options for the single-value feature filter dropdown. NOTE_REFINEMENT and
// NOTE_CHUNK_EDIT collapse into one "Note Editing" entry (NOTE_REFINEMENT is
// the canonical value), matching the merged label used everywhere else.
export const AI_FEATURE_FILTER_OPTIONS: { value: AiFeature; labelKey: string }[] = [
  { value: AiFeature.GRADING, labelKey: 'aiFeatures.grading' },
  { value: AiFeature.CHALLENGE, labelKey: 'aiFeatures.challenge' },
  { value: AiFeature.NOTE_GENERATION, labelKey: 'aiFeatures.noteGeneration' },
  { value: AiFeature.NOTE_REFINEMENT, labelKey: 'aiFeatures.noteEditing' },
  { value: AiFeature.TEST_GENERATION, labelKey: 'aiFeatures.testGeneration' },
  { value: AiFeature.ASSIST, labelKey: 'aiFeatures.assist' },
  { value: AiFeature.EMBEDDING, labelKey: 'aiFeatures.embedding' },
];

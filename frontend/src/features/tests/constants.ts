export const LONG_TEXT_LENGTH_TIERS = [
  { value: 1, label: 'Short (~500 chars)', limit: 500 },
  { value: 2, label: 'Medium (~1800 chars)', limit: 1800 },
  { value: 3, label: 'Long (~5000 chars)', limit: 5000 },
] as const;

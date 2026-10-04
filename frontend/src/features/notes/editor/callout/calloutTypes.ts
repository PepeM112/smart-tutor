// The five GitHub alert types. The Markdown marker is `> [!TYPE]`; the editor stores the type in lower case.

export const CALLOUT_TYPES = ['note', 'tip', 'important', 'warning', 'caution'] as const;

export type CalloutType = (typeof CALLOUT_TYPES)[number];

export const DEFAULT_CALLOUT_TYPE: CalloutType = 'note';

const isCalloutType = (value: unknown): value is CalloutType =>
  typeof value === 'string' && (CALLOUT_TYPES as readonly string[]).includes(value);

/** Read an unknown attribute value as a callout type. Unknown values become the default. */
export const toCalloutType = (value: unknown): CalloutType => (isCalloutType(value) ? value : DEFAULT_CALLOUT_TYPE);

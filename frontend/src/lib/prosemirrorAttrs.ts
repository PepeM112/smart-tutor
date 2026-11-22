import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

// ProseMirror types every attribute as `any`. These readers check the value instead of trusting a cast.
type Attrs = ProseMirrorNode['attrs'];

/** A text attribute, or `''` when it is unset or not text. */
export function stringAttr(attrs: Attrs, key: string): string {
  const value: unknown = attrs[key];
  return typeof value === 'string' ? value : '';
}

/** A text attribute, or `null` when it is unset or not text. */
export function optionalStringAttr(attrs: Attrs, key: string): string | null {
  const value: unknown = attrs[key];
  return typeof value === 'string' ? value : null;
}

/** A number attribute, or `undefined` when it is unset or not a number. */
export function numberAttr(attrs: Attrs, key: string): number | undefined {
  const value: unknown = attrs[key];
  return typeof value === 'number' ? value : undefined;
}

/** A list of numbers (for example `colwidth`), or `null` when the attribute is unset or has another shape. */
export function numberArrayAttr(attrs: Attrs, key: string): number[] | null {
  const value: unknown = attrs[key];
  return Array.isArray(value) && value.every(item => typeof item === 'number') ? value : null;
}

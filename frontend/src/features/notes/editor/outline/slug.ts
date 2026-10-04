// Heading slugs for anchor links. A slug is computed from the heading text each time the document
// renders. It is never saved in the Markdown, so the saved note stays plain.

const FALLBACK_SLUG = 'section';

/** "Café & Crème!" -> "cafe-creme". Keeps letters and digits of any script. */
export function slugify(text: string): string {
  const slug = text
    .normalize('NFKD')
    // Remove the combining marks that NFKD splits off (accents).
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug || FALLBACK_SLUG;
}

/**
 * Give each text a unique slug, in order. The first one keeps the plain slug.
 * Next ones with the same slug get `-2`, `-3`, ... A suffix that is already
 * taken by another heading (a heading called "Intro 2") is skipped.
 */
export function assignSlugs(texts: readonly string[]): string[] {
  const used = new Set<string>();
  const nextSuffix = new Map<string, number>();

  return texts.map(text => {
    const base = slugify(text);
    let candidate = base;
    let suffix = nextSuffix.get(base) ?? 1;
    while (used.has(candidate)) {
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
    nextSuffix.set(base, suffix);
    used.add(candidate);
    return candidate;
  });
}

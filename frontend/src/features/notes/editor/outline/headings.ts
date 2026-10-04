// The headings of a document, in order, with the slug id that the editor gives to each one.

import { assignSlugs } from './slug';

import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

export type OutlineHeading = {
  id: string;
  level: number;
  text: string;
  /** Document position of the heading node. */
  pos: number;
};

/** All headings in the document (also those inside a toggle, a callout or a list). */
export function collectHeadings(doc: ProseMirrorNode): OutlineHeading[] {
  const found: Omit<OutlineHeading, 'id'>[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return true;
    found.push({ level: Number(node.attrs.level) || 1, text: node.textContent.trim(), pos });
    // A heading has only inline content.
    return false;
  });

  const ids = assignSlugs(found.map(heading => heading.text));
  return found.map((heading, index) => ({ ...heading, id: ids[index] }));
}

// Adds a slug `id` to each heading element, so `/notes/{id}#slug` can scroll to it.
//
// The id is a ProseMirror node decoration, not an attribute of the node: it is computed from the text
// at render time and never enters the document or the saved Markdown. The decorations are computed
// again only when the document changes.

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

import { collectHeadings } from './headings';

import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

const headingAnchorsKey = new PluginKey<DecorationSet>('headingAnchors');

function buildDecorations(doc: ProseMirrorNode): DecorationSet {
  const headings = collectHeadings(doc).map(heading => {
    const node = doc.nodeAt(heading.pos);
    return Decoration.node(heading.pos, heading.pos + (node?.nodeSize ?? 1), { id: heading.id });
  });
  return DecorationSet.create(doc, headings);
}

export const HeadingAnchors = Extension.create({
  name: 'headingAnchors',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: headingAnchorsKey,
        state: {
          init: (_config, state) => buildDecorations(state.doc),
          apply: (tr, previous) => (tr.docChanged ? buildDecorations(tr.doc) : previous),
        },
        props: {
          decorations: state => headingAnchorsKey.getState(state),
        },
      }),
    ];
  },
});

// @vitest-environment jsdom

/**
 * Round-trip tests for the note editor's markdown parse ↔ serialize cycle.
 *
 * Strategy: build a lightweight Tiptap editor with only the markdown-relevant
 * extensions (no SlashMenuExtension / ReactRenderer to keep tests free of
 * React rendering).  For each fixture we assert:
 *
 *   1. Stability — serialize(parse(serialize(parse(x)))) === serialize(parse(x))
 *      (idempotent after the first normalisation pass)
 *   2. Content preservation — the normalised output is not empty and contains
 *      the key plaintext tokens from the fixture.
 *
 * Lossy constructs are documented inline (see LOSSY notes).
 */

import { readFileSync } from 'node:fs';

import { Editor } from '@tiptap/core';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Link from '@tiptap/extension-link';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { common, createLowlight } from 'lowlight';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseMarkdown, serializeMarkdown, selectionToMarkdown, replaceSelectionWithMarkdown } from './markdown';
import { NoteColorMark } from './noteColor';
import { createNoteTableExtensions } from './table/noteTable';

// ─── test editor setup ───────────────────────────────────────────────────────

// Same language set as `extensions.ts`.
const lowlight = createLowlight(common);

let editor: Editor;

beforeAll(() => {
  editor = new Editor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        heading: { levels: [1, 2, 3] },
      }),
      Markdown,
      Link.configure({ openOnClick: false, autolink: true }),
      ...createNoteTableExtensions(),
      TaskList,
      TaskItem.configure({ nested: false }),
      CodeBlockLowlight.configure({ lowlight }),
      NoteColorMark,
    ],
    content: '',
  });
});

afterAll(() => {
  editor?.destroy();
});

// ─── helpers ─────────────────────────────────────────────────────────────────

/** One round-trip: parse markdown, load into editor, serialize back. */
function roundTrip(md: string): string {
  const json = parseMarkdown(editor, md);
  editor.commands.setContent(json, { emitUpdate: false });
  return serializeMarkdown(editor);
}

/** Two round-trips — result must equal one round-trip (idempotent). */
function assertStable(md: string): void {
  const once = roundTrip(md);
  const twice = roundTrip(once);
  expect(twice).toBe(once);
}

/** Assert the round-tripped output contains all given substrings. */
function assertContains(output: string, ...tokens: string[]): void {
  tokens.forEach(token => {
    expect(output).toContain(token);
  });
}

// ─── fixtures ─────────────────────────────────────────────────────────────────

describe('markdown round-trip', () => {
  // ── headings ──────────────────────────────────────────────────────────────

  it('h1 heading', () => {
    const md = '# Introduction\n\nSome text.';
    assertStable(md);
    assertContains(roundTrip(md), 'Introduction', 'Some text');
  });

  it('h2 heading', () => {
    const md = '## Section Two\n\nContent here.';
    assertStable(md);
    assertContains(roundTrip(md), 'Section Two');
  });

  it('h3 heading', () => {
    const md = '### Sub-section\n\nDetails.';
    assertStable(md);
    assertContains(roundTrip(md), 'Sub-section');
  });

  // ── inline marks ──────────────────────────────────────────────────────────

  it('bold text', () => {
    const md = 'This is **important** content.';
    assertStable(md);
    assertContains(roundTrip(md), 'important');
  });

  it('italic text', () => {
    const md = 'This is *emphasis* content.';
    assertStable(md);
    assertContains(roundTrip(md), 'emphasis');
  });

  it('strikethrough text', () => {
    const md = 'This is ~~deleted~~ content.';
    assertStable(md);
    assertContains(roundTrip(md), 'deleted');
  });

  it('inline code', () => {
    const md = 'Use `console.log()` to debug.';
    assertStable(md);
    assertContains(roundTrip(md), 'console.log()');
  });

  it('combined inline marks', () => {
    const md = 'Here is **bold**, *italic*, ~~strike~~, and `code` together.';
    assertStable(md);
    assertContains(roundTrip(md), 'bold', 'italic', 'strike', 'code');
  });

  // ── links ─────────────────────────────────────────────────────────────────

  it('inline link', () => {
    const md = 'Visit [Google](https://google.com) for search.';
    assertStable(md);
    const out = roundTrip(md);
    assertContains(out, 'Google', 'https://google.com');
  });

  // ── lists ─────────────────────────────────────────────────────────────────

  it('bullet list', () => {
    const md = '- Apple\n- Banana\n- Cherry';
    assertStable(md);
    assertContains(roundTrip(md), 'Apple', 'Banana', 'Cherry');
  });

  it('ordered list', () => {
    const md = '1. First\n2. Second\n3. Third';
    assertStable(md);
    assertContains(roundTrip(md), 'First', 'Second', 'Third');
  });

  it('nested bullet list', () => {
    const md = '- Parent\n  - Child A\n  - Child B\n- Sibling';
    assertStable(md);
    assertContains(roundTrip(md), 'Parent', 'Child A', 'Sibling');
  });

  // ── task lists ────────────────────────────────────────────────────────────

  it('task list — unchecked', () => {
    const md = '- [ ] Buy milk\n- [ ] Read book';
    assertStable(md);
    assertContains(roundTrip(md), 'Buy milk', 'Read book');
  });

  it('task list — checked', () => {
    const md = '- [x] Done item\n- [ ] Pending item';
    assertStable(md);
    const out = roundTrip(md);
    assertContains(out, 'Done item', 'Pending item');
  });

  // ── GFM table ─────────────────────────────────────────────────────────────

  it('GFM table', () => {
    const md = '| Name    | Score |\n| ------- | ----- |\n| Alice   | 95    |\n| Bob     | 87    |';
    assertStable(md);
    const out = roundTrip(md);
    assertContains(out, 'Name', 'Score', 'Alice', 'Bob');
  });

  // ── fenced code blocks ────────────────────────────────────────────────────

  it('fenced code block without language', () => {
    const md = '```\nconsole.log("hello")\n```';
    assertStable(md);
    assertContains(roundTrip(md), 'console.log');
  });

  it('fenced code block with language', () => {
    const md = '```typescript\nconst x: number = 42;\n```';
    assertStable(md);
    assertContains(roundTrip(md), 'const x', '42');
  });

  it('python code block with language', () => {
    const md = '```python\ndef greet(name: str) -> str:\n    return f"Hello {name}"\n```';
    assertStable(md);
    assertContains(roundTrip(md), 'def greet', 'Hello');
  });

  // ── blockquote ────────────────────────────────────────────────────────────

  it('blockquote', () => {
    const md = '> To be or not to be, that is the question.';
    assertStable(md);
    assertContains(roundTrip(md), 'To be or not to be');
  });

  // ── horizontal rule ───────────────────────────────────────────────────────

  it('horizontal rule', () => {
    const md = 'Before\n\n---\n\nAfter';
    assertStable(md);
    const out = roundTrip(md);
    assertContains(out, 'Before', 'After');
    // The HR itself is normalized to "---"
    expect(out).toMatch(/---/);
  });

  // ── hard break ────────────────────────────────────────────────────────────

  /**
   * LOSSY NOTE — hard breaks:
   * GFM hard breaks (two trailing spaces or `\`) within a paragraph are
   * normalised to a single space by @tiptap/markdown on the first parse pass.
   * This is expected behaviour — the editor renders them as `<br>` but the
   * serializer outputs a soft newline, not two trailing spaces.
   *
   * The test therefore only asserts that the content is preserved and that
   * the output is stable (idempotent), not that the exact break syntax is kept.
   */
  it('paragraph with hard break — text preserved, break syntax may be normalised', () => {
    // Two trailing spaces = hard break in GFM.
    const md = 'Line one  \nLine two';
    const out = roundTrip(md);
    assertContains(out, 'Line one', 'Line two');
    assertStable(out); // stable from the normalised form
  });

  // ── colors (inline HTML spans) ──────────────────────────────────────────

  it('text color span round-trips exactly', () => {
    const md = 'A <span data-color="red">red</span> word.';
    expect(roundTrip(md)).toBe(md);
  });

  it('text + background color in one span', () => {
    const md = 'A <span data-color="blue" data-bg="yellow">marked</span> word.';
    expect(roundTrip(md)).toBe(md);
  });

  it('color inside bold keeps both marks', () => {
    const md = 'A **<span data-color="red">bold red</span>** word.';
    expect(roundTrip(md)).toBe(md);
  });

  it('unknown color names are dropped, text is kept', () => {
    const out = roundTrip('A <span data-color="neon">weird</span> word.');
    expect(out).toContain('weird');
    expect(out).not.toContain('neon');
  });

  it('kitchen-sink fixture — stable, no content loss', () => {
    const md = readFileSync(`${import.meta.dirname}/__fixtures__/kitchen-sink.md`, 'utf8');
    const out = roundTrip(md);
    assertContains(
      out,
      '# Heading 1',
      '## Heading 2',
      '### Heading 3',
      '<span data-color="purple">purple</span>',
      '<span data-bg="green">green</span>',
      '**<span data-color="red">bold red</span>**',
      '- [x] Done task',
      '```python',
      'estoy',
      '[link](https://example.com)'
    );
    assertStable(out);
  });

  // ── full fixture ──────────────────────────────────────────────────────────

  it('full structured fixture (h1, h2, lists, inline marks, table, code, quote)', () => {
    const fixture = `# Study Guide: Spanish Verbs

## Regular -AR Verbs

The most common verb group.  Learning these gives you **immediate progress**.

- *hablar* — to speak
- *caminar* — to walk
- *trabajar* — to work

### Conjugation Table

| Pronoun | Ending | Example     |
| ------- | ------ | ----------- |
| yo      | -o     | hablo       |
| tú      | -as    | hablas      |
| él/ella | -a     | habla       |

## Code Example

\`\`\`typescript
function conjugate(verb: string, pronoun: string): string {
  const root = verb.slice(0, -2);
  const endings: Record<string, string> = { yo: 'o', tu: 'as', el: 'a' };
  return root + (endings[pronoun] ?? '');
}
\`\`\`

## Key Tips

> Practice **daily** for best results — even 10 minutes matters.

- [ ] Complete unit 1
- [x] Learn greetings
- [ ] Practice with a partner

---

Use \`hacer\` for both "to do" and "to make".
`;
    const out = roundTrip(fixture);
    assertContains(
      out,
      'Study Guide: Spanish Verbs',
      'Regular -AR Verbs',
      'hablar',
      'hablo',
      'Conjugation Table',
      'function conjugate',
      'Practice',
      'Complete unit 1',
      'hacer'
    );
    assertStable(out);
  });

  // ── AI-generated style note ───────────────────────────────────────────────

  it('AI-generated style note — stable round-trip without content loss', () => {
    const aiNote = `## Overview

**Photosynthesis** is the process by which plants convert light into energy.

### Key Equation

\`6CO₂ + 6H₂O + light → C₆H₁₂O₆ + 6O₂\`

### Stages

1. **Light-dependent reactions** — occur in the thylakoid membranes
2. **Calvin cycle** (light-independent) — occurs in the stroma

### Inputs and Outputs

| Input       | Output        |
| ----------- | ------------- |
| CO₂         | Glucose       |
| Water (H₂O) | Oxygen (O₂)   |
| Light energy | ATP           |

### Checklist

- [x] Understand the light reactions
- [x] Understand the Calvin cycle
- [ ] Review C4 and CAM pathways

> *"Sunlight is the engine of all life on Earth."*

---

**Key terms**: chlorophyll, ATP, NADPH, stroma, thylakoid.
`;
    const out = roundTrip(aiNote);
    assertContains(out, 'Photosynthesis', 'thylakoid', 'Calvin cycle', 'Glucose', 'ATP', 'chlorophyll');
    assertStable(out);
  });
});

// ─── selection helpers ────────────────────────────────────────────────────────

describe('code block language', () => {
  // The language chip calls `updateAttributes({ language })`. The fence must carry it.
  function setFirstCodeBlockLanguage(language: string | null): void {
    editor.commands.command(({ tr, state }) => {
      state.doc.descendants((node, pos) => {
        if (node.type.name !== 'codeBlock') return true;
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, language });
        return false;
      });
      return true;
    });
  }

  it('stores a changed language as the fence info string', () => {
    roundTrip('```python\nprint(1)\n```');
    setFirstCodeBlockLanguage('typescript');
    const out = serializeMarkdown(editor);
    assertContains(out, '```typescript', 'print(1)');
    expect(roundTrip(out)).toBe(out);
  });

  it('Auto (null) removes the fence language', () => {
    roundTrip('```python\nprint(1)\n```');
    setFirstCodeBlockLanguage(null);
    expect(serializeMarkdown(editor)).toMatch(/^```\n/);
  });
});

describe('selectionToMarkdown', () => {
  it('returns empty string for collapsed selection', () => {
    editor.commands.setContent('<p>Hello world</p>');
    // Move cursor without selecting
    editor.commands.focus('start');
    expect(selectionToMarkdown(editor)).toBe('');
  });

  it('returns markdown for a text selection', () => {
    const json = parseMarkdown(editor, 'Hello **world** text.');
    editor.commands.setContent(json, { emitUpdate: false });

    // Select the whole content.
    editor.commands.selectAll();
    const result = selectionToMarkdown(editor);
    expect(result).toContain('world');
  });
});

describe('replaceSelectionWithMarkdown', () => {
  it('replaces a range with parsed markdown', () => {
    const json = parseMarkdown(editor, 'Original paragraph.');
    editor.commands.setContent(json, { emitUpdate: false });

    // Replace the entire paragraph content.
    const { from, to } = { from: 1, to: editor.state.doc.content.size - 1 };
    const replaced = replaceSelectionWithMarkdown(editor, from, to, '**Updated** content.');
    expect(replaced).toBe(true);

    const output = serializeMarkdown(editor);
    expect(output).toContain('Updated');
  });
});

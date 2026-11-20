import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const MIN_TEXT_CONTRAST = 4.5;

const CSS = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');

function readPalette(selector: string): Record<string, string> {
  const start = CSS.indexOf(`${selector} {`);
  const body = CSS.slice(start, CSS.indexOf('\n  }', start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)].map(m => [m[1], m[2]]));
}

function luminance(hex: string): number {
  const digits = hex.slice(1);
  const full = digits.length === 3 ? [...digits].map(c => c + c).join('') : digits;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255);
  const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

// [text token, background token]
const TEXT_PAIRS: [string, string][] = [
  ['foreground', 'background'],
  ['foreground', 'card'],
  ['foreground', 'popover'],
  ['foreground', 'muted'],
  ['secondary-foreground', 'secondary'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'card'],
  ['muted-foreground', 'secondary'],
  ['muted-foreground', 'muted'],
  ['foreground', 'outline'],
  ['muted-foreground', 'outline'],
  ['primary', 'outline'],
  ['primary-foreground', 'primary'],
  ['primary', 'background'],
  ['primary', 'card'],
  ['accent-foreground', 'accent'],
  ['destructive-foreground', 'destructive'],
  ['destructive', 'background'],
  ['destructive', 'card'],
  ['destructive', 'feedback-wrong-bg'],
  ['feedback-correct', 'card'],
  ['feedback-correct', 'feedback-correct-bg'],
  ['feedback-partial', 'card'],
  ['feedback-partial', 'feedback-partial-bg'],
  ['foreground', 'feedback-correct-bg'],
  ['foreground', 'feedback-partial-bg'],
  ['foreground', 'feedback-wrong-bg'],
  ['foreground', 'highlight-ai'],
  ['foreground', 'highlight-ai-active'],
  ['sidebar-foreground', 'sidebar'],
  ['sidebar-foreground', 'sidebar-accent'],
  ['sidebar-muted', 'sidebar'],
  ['sidebar-muted', 'sidebar-accent'],
  ['sidebar-destructive', 'sidebar'],
  ['code-fg', 'code-bg'],
];

describe.each([
  ['light', "[data-theme='light']"],
  ['dark', "[data-theme='dark']"],
])('%s palette text contrast', (_name, selector) => {
  const palette = readPalette(selector);

  it.each(TEXT_PAIRS)('%s on %s is at least 4.5:1', (text, background) => {
    expect(palette[text], `missing --${text}`).toBeDefined();
    expect(palette[background], `missing --${background}`).toBeDefined();
    expect(contrast(palette[text], palette[background])).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });
});

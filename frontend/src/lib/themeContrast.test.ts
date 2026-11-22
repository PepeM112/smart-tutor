import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { THEME_MODES } from './themes';

const MIN_TEXT_CONTRAST = 4.5;

const CSS = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');

// Folds every rule whose selector list names `selector`, in file order. This is the cascade for a
// theme: the light variants get the shared light tokens first, then their own sidebar overrides.
function readPalette(selector: string): Record<string, string> {
  const css = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, selectors]) =>
    selectors.split(',').some(candidate => candidate.trim() === selector)
  );
  return Object.fromEntries(
    rules.flatMap(([, , body]) => [...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)].map(m => [m[1], m[2]]))
  );
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
  ['sidebar-destructive', 'sidebar-accent'],
  ['sidebar-primary', 'sidebar'],
  ['sidebar-primary', 'sidebar-accent'],
  ['code-fg', 'code-bg'],
];

describe.each([
  ['light', "[data-theme='light']"],
  ['light-frame', "[data-theme='light-frame']"],
  ['light-ink', "[data-theme='light-ink']"],
  ['light-ink-frame', "[data-theme='light-ink-frame']"],
  ['dark', "[data-theme='dark']"],
])('%s palette text contrast', (_name, selector) => {
  const palette = readPalette(selector);

  it.each(TEXT_PAIRS)('%s on %s is at least 4.5:1', (text, background) => {
    expect(palette[text], `missing --${text}`).toBeDefined();
    expect(palette[background], `missing --${background}`).toBeDefined();
    expect(contrast(palette[text], palette[background])).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });
});

const MIN_SHAPE_CONTRAST = 3;

// No text sits on the ground. Two shapes do: the edge of the sheets and the resize handle between them.
// The default ground is the page color, where the sheet edge is the border, so only the frame variants are checked.
describe.each([
  ['light-frame', "[data-theme='light-frame']"],
  ['light-ink-frame', "[data-theme='light-ink-frame']"],
])('%s ground contrast', (_name, selector) => {
  const palette = readPalette(selector);

  it.each([
    ['card', 'ground'],
    ['ground-handle', 'ground'],
    ['ground-handle-hover', 'ground'],
    ['ground-handle-focus', 'ground'],
  ])('%s on %s is at least 3:1', (shape, ground) => {
    expect(contrast(palette[shape], palette[ground])).toBeGreaterThanOrEqual(MIN_SHAPE_CONTRAST);
  });
});

// Custom properties inherit. A palette that skips a token another palette overrides shows the token of
// whatever theme sits above it, so a preview of `dark` inside a `light-frame` page got the clay ground.
// The base rule (it lists `:root`) also holds tokens that no palette changes, such as the chart colors,
// so the check covers the tokens of the narrower rules only.
function ruleBodies(): { selectors: string[]; tokens: string[] }[] {
  const css = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body]) => ({
    selectors: selectors.split(',').map(candidate => candidate.trim()),
    tokens: [...body.matchAll(/--([\w-]+):/g)].map(m => m[1]),
  }));
}

describe('theme palettes are self-contained', () => {
  const rules = ruleBodies().filter(rule => rule.selectors.some(selector => selector.startsWith("[data-theme='")));
  const varying = new Set(rules.filter(rule => !rule.selectors.includes(':root')).flatMap(rule => rule.tokens));

  it.each(THEME_MODES.filter(mode => mode !== 'system'))('%s declares every token that a palette overrides', mode => {
    const declared = new Set(
      rules.filter(rule => rule.selectors.includes(`[data-theme='${mode}']`)).flatMap(rule => rule.tokens)
    );
    expect([...varying].filter(token => !declared.has(token))).toEqual([]);
  });
});

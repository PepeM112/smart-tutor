import { describe, expect, it } from 'vitest';

import { parseTheme, resolveTheme, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from './themes';

const LEGACY_LIGHT_IDS = ['ocean-blue', 'sky', 'slate-minimal', 'sunset', 'coral', 'forest', 'mint', 'sage'];
const LEGACY_DARK_IDS = ['midnight', 'carbon', 'neon', 'noir'];
const REMOVED_LIGHT_VARIANTS = ['light-sand', 'light-clay', 'light-clay-soft', 'light-clay-mist'];

describe('parseTheme', () => {
  it.each(['light', 'light-frame', 'light-ink', 'light-ink-frame', 'dark', 'system'])(
    'keeps the valid mode %s',
    mode => {
      expect(parseTheme(mode)).toBe(mode);
    }
  );

  it.each(LEGACY_LIGHT_IDS)('maps the old light id %s to light', id => {
    expect(parseTheme(id)).toBe('light');
  });

  it.each(LEGACY_DARK_IDS)('maps the old dark id %s to dark', id => {
    expect(parseTheme(id)).toBe('dark');
  });

  it.each(REMOVED_LIGHT_VARIANTS)('maps the removed variant %s to light', id => {
    expect(parseTheme(id)).toBe('light');
  });

  it('maps the removed light-clay-frame to light-frame', () => {
    expect(parseTheme('light-clay-frame')).toBe('light-frame');
  });

  it.each([null, undefined, '', 'unknown', 'Dark', 'constructor', 'toString'])('falls back to system for %s', value => {
    expect(parseTheme(value)).toBe('system');
  });
});

describe('resolveTheme', () => {
  it('follows the OS only in system mode', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('keeps a light variant in every OS setting', () => {
    expect(resolveTheme('light-frame', true)).toBe('light-frame');
    expect(resolveTheme('light-ink', false)).toBe('light-ink');
    expect(resolveTheme('light-ink-frame', true)).toBe('light-ink-frame');
  });
});

describe('THEME_INIT_SCRIPT', () => {
  const stored = [
    null,
    'light',
    'light-frame',
    'light-ink',
    'light-ink-frame',
    'dark',
    'system',
    'junk',
    'constructor',
    ...REMOVED_LIGHT_VARIANTS,
    'light-clay-frame',
    ...LEGACY_LIGHT_IDS,
    ...LEGACY_DARK_IDS,
  ];

  /** Runs the script like the browser does and returns the data-theme it sets. */
  function runScript(
    storedValue: string | null,
    prefersDark: boolean,
    getItem: (key: string) => string | null = key => (key === THEME_STORAGE_KEY ? storedValue : null)
  ): string | undefined {
    let applied: string | undefined;
    const localStorage = { getItem };
    const window = { matchMedia: () => ({ matches: prefersDark }) };
    const document = { documentElement: { setAttribute: (_name: string, value: string) => (applied = value) } };
    // The script is plain text in production, so the test has to compile it the same way.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
    new Function('localStorage', 'window', 'document', THEME_INIT_SCRIPT)(localStorage, window, document);
    return applied;
  }

  it.each(stored.flatMap(value => [true, false].map(prefersDark => [value, prefersDark] as const)))(
    'gives the same result as parseTheme + resolveTheme for %s (OS dark: %s)',
    (value, prefersDark) => {
      expect(runScript(value, prefersDark)).toBe(resolveTheme(parseTheme(value), prefersDark));
    }
  );

  it.each([true, false])('still follows the OS when storage throws (OS dark: %s)', prefersDark => {
    const blocked = (): string | null => {
      throw new Error('blocked');
    };
    expect(runScript(null, prefersDark, blocked)).toBe(prefersDark ? 'dark' : 'light');
  });
});

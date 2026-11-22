import type { UserRead } from '@/client';

// Aliased to the generated type so a backend change to the allowed values fails type-check here.
export type ThemeMode = NonNullable<UserRead['theme']>;
/** What the page shows. `system` resolves to plain `light` or `dark` from the OS setting, never to a light variant. */
export type ResolvedTheme = Exclude<ThemeMode, 'system'>;

// The light variants share the light palette and change only the sidebar tokens. The `-frame` ones also paint the ground.
export const THEME_MODES: readonly ThemeMode[] = [
  'light',
  'light-frame',
  'light-ink',
  'light-ink-frame',
  'dark',
  'system',
];
const EXPLICIT_THEME_MODES = THEME_MODES.filter(mode => mode !== 'system');
export const DEFAULT_THEME_MODE: ThemeMode = 'system';
export const THEME_STORAGE_KEY = 'smarttutor-theme';
export const THEME_COOKIE = 'smarttutor-theme';
export const DARK_QUERY = '(prefers-color-scheme: dark)';

// Ids that no longer exist, and the theme that replaces each one (user.theme, cookie, localStorage).
// Old palette ids: light palettes -> light, dark palettes -> dark. Removed light variants: the backend
// migration `remap_removed_light_themes` applies the same map to the stored user.theme.
const LEGACY_THEME_IDS: Record<string, ResolvedTheme> = {
  ...Object.fromEntries(
    ['ocean-blue', 'sky', 'slate-minimal', 'sunset', 'coral', 'forest', 'mint', 'sage'].map(id => [
      id,
      'light' as const,
    ])
  ),
  ...Object.fromEntries(['midnight', 'carbon', 'neon', 'noir'].map(id => [id, 'dark' as const])),
  'light-sand': 'light',
  'light-clay': 'light',
  'light-clay-soft': 'light',
  'light-clay-mist': 'light',
  'light-clay-frame': 'light-frame',
};

/** Maps any stored value (new mode, old palette id, junk, nothing) to a valid mode. */
export function parseTheme(value: string | null | undefined): ThemeMode {
  const mode = THEME_MODES.find(candidate => candidate === value);
  if (mode) return mode;
  const legacy = value ? Object.entries(LEGACY_THEME_IDS).find(([id]) => id === value) : undefined;
  return legacy ? legacy[1] : DEFAULT_THEME_MODE;
}

export function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (mode === 'system') return prefersDark ? 'dark' : 'light';
  return mode;
}

/**
 * Runs in <head> before hydration, so a dark user never sees a light first paint when the server did
 * not know the theme (no cookie, or `system`). It repeats parseTheme + resolveTheme in plain ES5,
 * built from the same id lists; themes.test.ts runs it against both functions to catch drift. Storage has its own `try`:
 * a blocked storage must still fall through to the OS setting.
 */
export const THEME_INIT_SCRIPT = `(function(){var s=null;try{s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})}catch(e){}try{var m=${JSON.stringify(EXPLICIT_THEME_MODES)};var g=${JSON.stringify(LEGACY_THEME_IDS)};var t=m.indexOf(s)>-1?s:g.hasOwnProperty(s)?g[s]:window.matchMedia(${JSON.stringify(DARK_QUERY)}).matches?"dark":"light";document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export type ThemeMode = 'light' | 'dark' | 'system';
/** What the page shows: `system` resolves to one of these from the OS setting. */
export type ResolvedTheme = 'light' | 'dark';

export const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system'];
export const DEFAULT_THEME_MODE: ThemeMode = 'system';
export const THEME_STORAGE_KEY = 'smarttutor-theme';
export const THEME_COOKIE = 'smarttutor-theme';
export const DARK_QUERY = '(prefers-color-scheme: dark)';

// The old multi-theme system stored one of these ids (user.theme, cookie, localStorage).
// Same mapping as the backend migration: light palettes -> light, dark palettes -> dark.
const LEGACY_LIGHT_IDS = ['ocean-blue', 'sky', 'slate-minimal', 'sunset', 'coral', 'forest', 'mint', 'sage'];
const LEGACY_DARK_IDS = ['midnight', 'carbon', 'neon', 'noir'];

/** Maps any stored value (new mode, old palette id, junk, nothing) to a valid mode. */
export function parseTheme(value: string | null | undefined): ThemeMode {
  if (value === 'light' || value === 'dark' || value === 'system') return value;
  if (value && LEGACY_LIGHT_IDS.includes(value)) return 'light';
  if (value && LEGACY_DARK_IDS.includes(value)) return 'dark';
  return DEFAULT_THEME_MODE;
}

export function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (mode === 'system') return prefersDark ? 'dark' : 'light';
  return mode;
}

/**
 * Runs in <head> before hydration, so a dark user never sees a light first paint when the server did
 * not know the theme (no cookie, or `system`). It repeats parseTheme + resolveTheme in plain ES5,
 * built from the same id lists; themes.test.ts runs it against both functions to catch drift.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var d=${JSON.stringify(LEGACY_DARK_IDS)};var l=${JSON.stringify(LEGACY_LIGHT_IDS)};var dark=s==="dark"||d.indexOf(s)>-1||(s!=="light"&&l.indexOf(s)<0&&window.matchMedia(${JSON.stringify(DARK_QUERY)}).matches);document.documentElement.setAttribute("data-theme",dark?"dark":"light")}catch(e){}})()`;

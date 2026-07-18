export type ThemeId =
  | 'ocean-blue'
  | 'sky'
  | 'slate-minimal'
  | 'sunset'
  | 'coral'
  | 'forest'
  | 'mint'
  | 'sage'
  | 'midnight'
  | 'carbon'
  | 'neon'
  | 'noir';

export interface ThemePreview {
  id: ThemeId;
  name: string;
  sidebar: string;
  primary: string;
  background: string;
  foreground: string;
  accent: string;
}

export const DEFAULT_THEME_ID: ThemeId = 'ocean-blue';
export const THEME_STORAGE_KEY = 'smarttutor-theme';
export const THEME_COOKIE = 'smarttutor-theme';

export const themes: ThemePreview[] = [
  // ── Light themes ──
  {
    id: 'ocean-blue',
    name: 'Ocean Blue',
    sidebar: '#1e3a5f',
    primary: '#2d5f9e',
    background: '#ffffff',
    foreground: '#1e293b',
    accent: '#dbeafe',
  },
  {
    id: 'sky',
    name: 'Sky',
    sidebar: '#193050',
    primary: '#4a90d9',
    background: '#f7faff',
    foreground: '#1a2c40',
    accent: '#c8ddf0',
  },
  {
    id: 'slate-minimal',
    name: 'Slate Minimal',
    sidebar: '#1e293b',
    primary: '#475569',
    background: '#ffffff',
    foreground: '#1e293b',
    accent: '#e2e8f0',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    sidebar: '#7c2d12',
    primary: '#ea580c',
    background: '#ffffff',
    foreground: '#1e293b',
    accent: '#fed7aa',
  },
  {
    id: 'coral',
    name: 'Coral',
    sidebar: '#6b3022',
    primary: '#d97756',
    background: '#fffaf8',
    foreground: '#3d2420',
    accent: '#f5d5c8',
  },
  {
    id: 'forest',
    name: 'Forest',
    sidebar: '#064e3b',
    primary: '#059669',
    background: '#ffffff',
    foreground: '#1e293b',
    accent: '#d1fae5',
  },
  {
    id: 'mint',
    name: 'Mint',
    sidebar: '#0d4f4a',
    primary: '#0ea5a0',
    background: '#f5fdfb',
    foreground: '#1a2d2a',
    accent: '#b2e4de',
  },
  {
    id: 'sage',
    name: 'Sage',
    sidebar: '#2d4a3a',
    primary: '#5a8567',
    background: '#f8faf8',
    foreground: '#1e2d24',
    accent: '#d0e0d5',
  },
  // ── Dark themes ──
  {
    id: 'midnight',
    name: 'Midnight',
    sidebar: '#0b1120',
    primary: '#60a5fa',
    background: '#0f172a',
    foreground: '#f8fafc',
    accent: '#1e3a5f',
  },
  {
    id: 'carbon',
    name: 'Carbon',
    sidebar: '#0a0a0a',
    primary: '#a0a0a0',
    background: '#121212',
    foreground: '#e0e0e0',
    accent: '#333333',
  },
  {
    id: 'neon',
    name: 'Neon',
    sidebar: '#000000',
    primary: '#facc15',
    background: '#0a0a0a',
    foreground: '#f5f5f5',
    accent: '#2a2500',
  },
  {
    id: 'noir',
    name: 'Noir',
    sidebar: '#000000',
    primary: '#f0f0f0',
    background: '#0a0a0a',
    foreground: '#e5e5e5',
    accent: '#2a2a2a',
  },
];

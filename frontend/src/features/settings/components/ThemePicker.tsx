'use client';

import { useTranslations } from 'next-intl';
import { useId } from 'react';

import { useTheme } from '@/hooks/useTheme';
import { parseTheme, type ThemeMode } from '@/lib/themes';
import { cn } from '@/lib/utils';

import { useDebouncedUpdateUser } from '../hooks/useDebouncedUpdateUser';

const THEME_LABEL_KEYS: Record<ThemeMode, string> = {
  light: 'settings.theme_light',
  'light-frame': 'settings.theme_light_frame',
  'light-ink': 'settings.theme_light_ink',
  'light-ink-frame': 'settings.theme_light_ink_frame',
  dark: 'settings.theme_dark',
  system: 'settings.theme_system',
};

// System comes first and has no heading: it is the default, and it is neither a light nor a dark theme.
const THEME_SECTIONS: readonly { headingKey?: string; modes: readonly ThemeMode[] }[] = [
  { modes: ['system'] },
  { headingKey: 'settings.theme_group_light', modes: ['light', 'light-frame', 'light-ink', 'light-ink-frame'] },
  { headingKey: 'settings.theme_group_dark', modes: ['dark'] },
];

export function ThemePicker() {
  const t = useTranslations();
  const { theme, setTheme } = useTheme();
  const labelId = useId();
  const saveUser = useDebouncedUpdateUser();

  // The page changes at once. The save waits for the last click (see `useDebouncedUpdateUser`).
  const selectTheme = (mode: ThemeMode): void =>
    saveUser({ theme: mode }, { field: 'theme', show: ({ theme: shown }) => shown && setTheme(parseTheme(shown)) });

  return (
    <div className="space-y-3">
      <h3 id={labelId} className="text-sm font-semibold text-foreground">
        {t('settings.theme_label')}
      </h3>

      <div role="radiogroup" aria-labelledby={labelId} className="space-y-4">
        {THEME_SECTIONS.map(({ headingKey, modes }) => (
          <ThemeSection
            key={headingKey ?? 'default'}
            heading={headingKey && t(headingKey)}
            modes={modes}
            activeMode={theme}
            getLabel={mode => t(THEME_LABEL_KEYS[mode])}
            onSelect={selectTheme}
          />
        ))}
      </div>
    </div>
  );
}

interface ThemeSectionProps {
  heading?: string;
  modes: readonly ThemeMode[];
  activeMode: ThemeMode;
  getLabel: (mode: ThemeMode) => string;
  onSelect: (mode: ThemeMode) => void;
}

function ThemeSection({ heading, modes, activeMode, getLabel, onSelect }: ThemeSectionProps) {
  const headingId = useId();

  return (
    <div role="group" aria-labelledby={heading ? headingId : undefined} className="space-y-2">
      {heading && (
        <h4 id={headingId} className="text-xs font-medium text-muted-foreground">
          {heading}
        </h4>
      )}
      <div className="flex flex-wrap gap-2">
        {modes.map(mode => (
          <ThemeOption
            key={mode}
            mode={mode}
            label={getLabel(mode)}
            isActive={activeMode === mode}
            onSelect={() => onSelect(mode)}
          />
        ))}
      </div>
    </div>
  );
}

interface ThemeOptionProps {
  mode: ThemeMode;
  label: string;
  isActive: boolean;
  onSelect: () => void;
}

function ThemeOption({ mode, label, isActive, onSelect }: ThemeOptionProps) {
  return (
    <label
      className={cn(
        'relative flex cursor-pointer flex-col gap-2 rounded-lg border border-border p-2 transition-colors',
        'has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
        isActive ? 'border-primary bg-muted' : 'hover:bg-muted/60'
      )}
    >
      <input type="radio" name="theme" value={mode} checked={isActive} onChange={onSelect} className="sr-only" />
      <ThemePreview mode={mode} />
      <span className={cn('flex h-5 items-center text-sm', isActive ? 'font-semibold' : 'font-normal')}>{label}</span>
    </label>
  );
}

function ThemePreview({ mode }: { mode: ThemeMode }) {
  const clipId = useId();

  return (
    <span aria-hidden="true" className="block h-[64px] w-[104px] overflow-hidden rounded-md outline outline-border">
      <svg viewBox="0 0 104 64" width="104" height="64" className="block">
        <g data-theme={mode === 'system' ? 'light' : mode}>
          <PreviewScene />
        </g>
        {mode === 'system' && (
          <>
            <clipPath id={clipId}>
              <rect x="52" y="0" width="52" height="64" />
            </clipPath>
            <g clipPath={`url(#${clipId})`} data-theme="dark">
              <PreviewScene />
            </g>
          </>
        )}
      </svg>
    </span>
  );
}

// Colors are the live tokens. The wrapping `data-theme` picks which palette they resolve to, so the
// preview can show both palettes at once and still follows globals.css. The left strip is the sidebar and the
// backdrop is the ground: they are the only parts that differ between the light variants.
function PreviewScene() {
  return (
    <>
      <rect width="104" height="64" fill="var(--ground)" />
      <rect width="22" height="64" fill="var(--sidebar)" />
      {[10, 17, 24].map(y => (
        <rect key={y} x="5" y={y} width="12" height="3" rx="1.5" fill="var(--sidebar-muted)" />
      ))}
      <rect x="26.5" y="6.5" width="71" height="51" rx="4" fill="var(--card)" stroke="var(--border)" />
      <rect x="34" y="15" width="30" height="4" rx="2" fill="var(--foreground)" />
      <rect x="34" y="25" width="52" height="3" rx="1.5" fill="var(--border)" />
      <rect x="34" y="32" width="44" height="3" rx="1.5" fill="var(--border)" />
      <rect x="34" y="43" width="18" height="7" rx="2" fill="var(--primary)" />
    </>
  );
}

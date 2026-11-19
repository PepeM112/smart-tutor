'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { toast } from 'sonner';

import { useAuthStore } from '@/features/auth/store/authStore';
import { useTheme } from '@/hooks/useTheme';
import { sdk } from '@/lib/apiClient';
import { THEME_MODES, type ThemeMode } from '@/lib/themes';
import { cn } from '@/lib/utils';

// The preview shows both palettes at once, so it cannot use the live tokens. Values: DESIGN-PAPER2.md.
const PREVIEW_PALETTES = {
  light: {
    ground: '#f6f2ea',
    nav: '#d9d1c3',
    sheet: '#fffdf8',
    border: '#e3dccf',
    ink: '#2a2622',
    accent: '#a64b24',
  },
  dark: {
    ground: '#1c1a17',
    nav: '#443e36',
    sheet: '#24211d',
    border: '#3a352e',
    ink: '#ece6da',
    accent: '#d27a4e',
  },
} as const;

type PreviewPalette = (typeof PREVIEW_PALETTES)[keyof typeof PREVIEW_PALETTES];

export function ThemePicker() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const setUser = useAuthStore(s => s.setUser);
  const { theme, setTheme } = useTheme();
  const labelId = useId();

  // The page changes at once. If the save fails, the previous theme comes back.
  const { mutate: saveTheme } = useMutation({
    mutationFn: async (mode: ThemeMode) => (await sdk.usersUpdateMe({ body: { theme: mode } })).data!,
    onMutate: (mode: ThemeMode) => {
      const previous = theme;
      setTheme(mode);
      return { previous };
    },
    onSuccess: updatedUser => {
      setUser(updatedUser);
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.success(t('settings.settings_saved'));
    },
    onError: (_error, _mode, context) => {
      if (context) setTheme(context.previous);
      toast.error(t('settings.failed_to_save'));
    },
  });

  return (
    <div className="space-y-3">
      <h3 id={labelId} className="text-sm font-semibold text-foreground">
        {t('settings.theme_label')}
      </h3>

      <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {THEME_MODES.map(mode => (
          <ThemeOption
            key={mode}
            mode={mode}
            label={t(`settings.theme_${mode}`)}
            isActive={theme === mode}
            onSelect={() => saveTheme(mode)}
          />
        ))}
      </div>
    </div>
  );
}

type ThemeOptionProps = {
  mode: ThemeMode;
  label: string;
  isActive: boolean;
  onSelect: () => void;
};

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
      <span className={cn('flex h-5 items-center gap-1.5 text-sm', isActive ? 'font-semibold' : 'font-normal')}>
        {isActive && <Check className="size-3.5 shrink-0" aria-hidden="true" />}
        {label}
      </span>
    </label>
  );
}

function ThemePreview({ mode }: { mode: ThemeMode }) {
  const clipId = useId();

  return (
    <span aria-hidden="true" className="block h-[64px] w-[104px] overflow-hidden rounded-md outline outline-border">
      <svg viewBox="0 0 104 64" width="104" height="64" className="block">
        <PreviewScene palette={PREVIEW_PALETTES[mode === 'dark' ? 'dark' : 'light']} />
        {mode === 'system' && (
          <>
            <clipPath id={clipId}>
              <rect x="52" y="0" width="52" height="64" />
            </clipPath>
            <g clipPath={`url(#${clipId})`}>
              <PreviewScene palette={PREVIEW_PALETTES.dark} />
            </g>
          </>
        )}
      </svg>
    </span>
  );
}

function PreviewScene({ palette }: { palette: PreviewPalette }) {
  return (
    <>
      <rect width="104" height="64" fill={palette.ground} />
      {[10, 17, 24].map(y => (
        <rect key={y} x="6" y={y} width="14" height="3" rx="1.5" fill={palette.nav} />
      ))}
      <rect x="26.5" y="6.5" width="71" height="51" rx="4" fill={palette.sheet} stroke={palette.border} />
      <rect x="34" y="15" width="30" height="4" rx="2" fill={palette.ink} />
      <rect x="34" y="25" width="52" height="3" rx="1.5" fill={palette.border} />
      <rect x="34" y="32" width="44" height="3" rx="1.5" fill={palette.border} />
      <rect x="34" y="43" width="18" height="7" rx="2" fill={palette.accent} />
    </>
  );
}

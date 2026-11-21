'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useRef } from 'react';
import { toast } from 'sonner';

import { useAuthStore } from '@/features/auth/store/authStore';
import { useTheme } from '@/hooks/useTheme';
import { sdk } from '@/lib/apiClient';
import { parseTheme, THEME_MODES, type ThemeMode } from '@/lib/themes';
import { cn } from '@/lib/utils';

import { USER_UPDATE_SCOPE } from '../hooks/useUpdateUser';

export function ThemePicker() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const setUser = useAuthStore(s => s.setUser);
  const { theme, setTheme } = useTheme();
  const labelId = useId();

  // The last theme the backend confirmed, and the last one the user clicked.
  const savedMode = useRef<ThemeMode>(theme);
  const requestedMode = useRef<ThemeMode>(theme);

  // The page changes at once. Saves run one at a time (same `scope`), so the last click is the last write
  // on the backend. A failed save reverts the page only if no later click replaced it.
  const { mutate: saveTheme } = useMutation({
    scope: { id: USER_UPDATE_SCOPE },
    mutationFn: async (mode: ThemeMode) => (await sdk.usersUpdateMe({ body: { theme: mode } })).data!,
    onMutate: (mode: ThemeMode) => {
      requestedMode.current = mode;
      setTheme(mode);
    },
    onSuccess: updatedUser => {
      savedMode.current = parseTheme(updatedUser.theme);
      setUser(updatedUser);
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.success(t('settings.settings_saved'));
    },
    onError: (_error, mode) => {
      if (requestedMode.current === mode) {
        requestedMode.current = savedMode.current;
        setTheme(savedMode.current);
      }
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
        <g data-theme={mode === 'dark' ? 'dark' : 'light'}>
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
// preview can show both palettes at once and still follows globals.css.
function PreviewScene() {
  return (
    <>
      <rect width="104" height="64" fill="var(--background)" />
      {[10, 17, 24].map(y => (
        <rect key={y} x="6" y={y} width="14" height="3" rx="1.5" fill="var(--rule)" />
      ))}
      <rect x="26.5" y="6.5" width="71" height="51" rx="4" fill="var(--card)" stroke="var(--border)" />
      <rect x="34" y="15" width="30" height="4" rx="2" fill="var(--foreground)" />
      <rect x="34" y="25" width="52" height="3" rx="1.5" fill="var(--border)" />
      <rect x="34" y="32" width="44" height="3" rx="1.5" fill="var(--border)" />
      <rect x="34" y="43" width="18" height="7" rx="2" fill="var(--primary)" />
    </>
  );
}

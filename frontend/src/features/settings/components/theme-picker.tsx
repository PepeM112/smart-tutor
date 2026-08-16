'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useTheme } from '@/hooks/use-theme';
import { themes, type ThemePreview } from '@/lib/themes';
import { cn } from '@/lib/utils';

const DARK_THEMES = new Set(['midnight', 'carbon', 'neon', 'noir']);

const lightThemes = themes.filter(t => !DARK_THEMES.has(t.id));
const darkThemes = themes.filter(t => DARK_THEMES.has(t.id));

export function ThemePicker() {
  const t = useTranslations('settings');
  const { themeId, setTheme } = useTheme();

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{t('theme_label')}</h3>
        <p className="text-xs text-muted-foreground">{t('theme_description')}</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('theme_light_group')}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {lightThemes.map(theme => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              isActive={themeId === theme.id}
              onSelect={() => setTheme(theme.id)}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('theme_dark_group')}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {darkThemes.map(theme => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              isActive={themeId === theme.id}
              onSelect={() => setTheme(theme.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ThemeCard({ theme, isActive, onSelect }: { theme: ThemePreview; isActive: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'group relative flex flex-col gap-2.5 rounded-xl p-3 text-left transition-[color,background-color,border-color,box-shadow,outline]',
        'ring-1 ring-foreground/10 hover:ring-foreground/20',
        isActive && 'ring-2 ring-primary'
      )}
    >
      <div className="flex h-10 w-full overflow-hidden rounded-md ring-1 ring-black/10">
        <div className="w-1/4 shrink-0" style={{ backgroundColor: theme.sidebar }} />
        <div className="flex-1 flex flex-col p-1.5 gap-1" style={{ backgroundColor: theme.background }}>
          <div className="h-1.5 w-3/4 rounded-full" style={{ backgroundColor: theme.primary }} />
          <div className="h-1 w-1/2 rounded-full" style={{ backgroundColor: theme.accent }} />
          <div className="h-1 w-2/3 rounded-full opacity-50" style={{ backgroundColor: theme.foreground }} />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{theme.name}</span>
        {isActive && <Check className="size-3.5 text-primary" />}
      </div>
    </button>
  );
}

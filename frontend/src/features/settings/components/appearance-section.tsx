'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/features/auth/store/auth-store';
import { sdk } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const THEMES = [
  { value: 'light', icon: Sun, labelKey: 'theme_light' },
  { value: 'dark', icon: Moon, labelKey: 'theme_dark' },
  { value: 'system', icon: Monitor, labelKey: 'theme_system' },
] as const;

export function AppearanceSection() {
  const t = useTranslations('settings');
  const { theme, setTheme } = useTheme();
  const setUser = useAuthStore(s => s.setUser);

  const handleThemeChange = (value: string) => {
    setTheme(value);
    void sdk.usersUpdateMe({ body: { theme: value } }).then(result => {
      if (result.data) setUser(result.data);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('appearance')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Label>{t('theme')}</Label>
        <div className="flex gap-2">
          {THEMES.map(({ value, icon: Icon, labelKey }) => (
            <button
              key={value}
              onClick={() => handleThemeChange(value)}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                theme === value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="size-4" />
              {t(labelKey)}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

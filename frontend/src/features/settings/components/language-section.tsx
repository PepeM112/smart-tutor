'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useTransition } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/features/auth/store/auth-store';
import { sdk } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const LANGUAGES = [
  { value: 'en', labelKey: 'english', flag: '🇬🇧' },
  { value: 'es', labelKey: 'spanish', flag: '🇪🇸' },
] as const;

export function LanguageSection() {
  const t = useTranslations('settings');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const setUser = useAuthStore(s => s.setUser);

  const currentLocale =
    typeof document !== 'undefined'
      ? (document.cookie
          .split('; ')
          .find(c => c.startsWith('locale='))
          ?.split('=')[1] ?? 'en')
      : 'en';

  const setLocale = useCallback(
    (locale: string) => {
      document.cookie = `locale=${locale};path=/;max-age=31536000`;
      void sdk.usersUpdateMe({ body: { locale } }).then(result => {
        if (result.data) setUser(result.data);
      });
      startTransition(() => {
        router.refresh();
      });
    },
    [router, setUser]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('language')}</CardTitle>
        <CardDescription>{t('language_description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Label>{t('language')}</Label>
        <div className={cn('flex gap-2', isPending && 'opacity-50 pointer-events-none')}>
          {LANGUAGES.map(({ value, labelKey, flag }) => (
            <button
              key={value}
              onClick={() => setLocale(value)}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                currentLocale === value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <span>{flag}</span>
              {t(labelKey)}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

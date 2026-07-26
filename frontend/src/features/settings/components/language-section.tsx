'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';

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
  const currentLocale = useLocale();
  const [isPending, startTransition] = useTransition();
  const setUser = useAuthStore(s => s.setUser);

  const { mutate: updateLocale } = useMutation({
    mutationFn: async (locale: string) => {
      const result = await sdk.usersUpdateMe({ body: { locale } });
      return result.data!;
    },
    onSuccess: updatedUser => {
      document.cookie = `locale=${updatedUser.locale};path=/;max-age=31536000`;
      setUser(updatedUser);
      startTransition(() => {
        router.refresh();
      });
    },
    onError: () => {
      toast.error(t('failed_to_save'));
    },
  });

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
              onClick={() => updateLocale(value)}
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

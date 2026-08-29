import { getTranslations } from 'next-intl/server';

import { SignupForm } from '@/features/auth/components/SignupForm';

export default async function SignupPage() {
  const t = await getTranslations('app');

  return (
    <main className="min-h-screen w-full flex flex-col items-center justify-center bg-accent p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold text-primary tracking-tight text-balance">{t('title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('tagline')}</p>
        </div>
        <SignupForm />
      </div>
    </main>
  );
}

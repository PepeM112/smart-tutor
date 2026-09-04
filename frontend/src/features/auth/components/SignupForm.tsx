'use client';

import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import type { UserCreate } from '@/client/types.gen';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { sdk } from '@/lib/apiClient';
import { Routes } from '@/lib/routes';

export function SignupForm() {
  const t = useTranslations();
  const [form, setForm] = useState<UserCreate>({ username: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const {
    mutate: signin,
    isPending: isSigningIn,
    error: signinError,
  } = useMutation({
    mutationFn: () => sdk.usersSignup({ body: form }),
    onSuccess: () => {
      toast.success(t('auth.account_created'));
      router.push(Routes.LOGIN);
      router.refresh();
    },
    onError: () => {
      toast.error(t('auth.error_creating_account'));
    },
  });

  const handleSubmit = (e: { preventDefault(): void }) => {
    e.preventDefault();
    signin();
  };

  return (
    <Card className="w-full">
      <CardHeader className="text-center pb-2">
        <CardTitle className="text-3xl font-bold py-2">{t('auth.sign_up')}</CardTitle>
        <p className="text-sm text-muted-foreground">{t('auth.create_your_account')}</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">{t('auth.username')}</Label>
            <Input
              id="username"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              className="py-5 border-2"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t('auth.email')}</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="py-5 border-2"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t('auth.password')}</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="py-5 border-2 pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer transition-colors"
                aria-label={showPassword ? t('auth.hide_password') : t('auth.show_password')}
              >
                {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            </div>
          </div>

          {signinError && <p className="text-sm text-destructive">{t('auth.could_not_create_account')}</p>}

          <Button type="submit" disabled={isSigningIn} className="w-full py-5 font-semibold mt-6">
            {isSigningIn ? t('auth.creating_account') : t('auth.create_account')}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          {t('auth.already_have_account')}{' '}
          <Link href={Routes.LOGIN} className="text-primary font-bold underline">
            {t('auth.log_in')}
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}

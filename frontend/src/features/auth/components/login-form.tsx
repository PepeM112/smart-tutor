'use client';

import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import type { BodyUsersLogin } from '@/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';

import { useAuthStore } from '../store/auth-store';

type LoginErrorKey = 'invalid_credentials' | 'network_error' | 'server_error';

function getLoginErrorKey(error: unknown): LoginErrorKey {
  if (error instanceof TypeError) return 'network_error';
  return 'invalid_credentials';
}

export function LoginForm() {
  const router = useRouter();
  const t = useTranslations('auth');

  const [form, setForm] = useState<BodyUsersLogin>({ username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const setUser = useAuthStore(state => state.setUser);

  const {
    mutate: login,
    isPending: isLoggingIn,
    error: loginError,
  } = useMutation({
    mutationFn: () =>
      sdk.usersLogin({
        body: { username: form.username, password: form.password },
      }),
    onSuccess: response => {
      setUser(response.data ?? null);
      router.push(Routes.DASHBOARD);
      router.refresh();
    },
    onError: (error: Error) => {
      toast.error(t(getLoginErrorKey(error)));
    },
  });

  const handleSubmit: React.SubmitEventHandler<HTMLFormElement> = e => {
    e.preventDefault();
    login();
  };

  return (
    <Card className="w-full">
      <CardHeader className="text-center pb-2">
        <CardTitle className="text-3xl font-bold py-2">{t('log_in')}</CardTitle>
        <p className="text-sm text-muted-foreground">{t('welcome_back')}</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t('email')}</Label>
            <Input
              id="email"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              className="py-5 border-2"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t('password')}</Label>
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
                aria-label={showPassword ? t('hide_password') : t('show_password')}
              >
                {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            </div>
          </div>

          {loginError && <p className="text-sm text-destructive">{t(getLoginErrorKey(loginError))}</p>}

          <Button type="submit" disabled={isLoggingIn} className="w-full py-5 font-semibold mt-6">
            {isLoggingIn ? t('logging_in') : t('log_in')}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          {t('dont_have_account')}{' '}
          <Link href={Routes.SIGNUP} className="text-primary font-bold underline">
            {t('sign_up')}
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}

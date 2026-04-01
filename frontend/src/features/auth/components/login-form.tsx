'use client';

import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import type { BodyLoginApiV1UsersLoginPost } from '@/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { sdk } from '@/lib/api-client';

import { useAuthStore } from '../store/authStore';

export function LoginForm() {
  const [form, setForm] = useState<BodyLoginApiV1UsersLoginPost>({ username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const setUser = useAuthStore(state => state.setUser);

  const {
    mutate: login,
    isPending: isLoggingIn,
    error: loginError,
  } = useMutation({
    mutationFn: () =>
      sdk.loginApiV1UsersLoginPost({
        body: { username: form.username, password: form.password },
      }),
    onSuccess: response => {
      setUser(response.data ?? null);
    },
  });

  const handleSubmit = (e: { preventDefault(): void }) => {
    e.preventDefault();
    login();
  };

  return (
    <Card className="w-full">
      <CardHeader className="text-center pb-2">
        <CardTitle className="text-3xl font-bold py-2">Log in</CardTitle>
        <p className="text-sm text-muted-foreground">Welcome back — pick up where you left off</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              className="py-5 border-2"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
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
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            </div>
          </div>

          {loginError && <p className="text-sm text-destructive">Invalid email or password.</p>}

          <Button type="submit" disabled={isLoggingIn} className="w-full py-5 font-semibold mt-6">
            {isLoggingIn ? 'Logging in…' : 'Log in'}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-primary font-bold underline">
            Sign up
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}

'use client';

import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { UserCreate } from '@/client/types.gen';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';

export function SignupForm() {
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
      router.push(Routes.LOGIN);
      router.refresh();
    },
  });

  const handleSubmit = (e: { preventDefault(): void }) => {
    e.preventDefault();
    signin();
  };

  return (
    <Card className="w-full">
      <CardHeader className="text-center pb-2">
        <CardTitle className="text-3xl font-bold py-2">Sign up</CardTitle>
        <p className="text-sm text-muted-foreground">Create your account to start learning</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              className="py-5 border-2"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
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

          {signinError && <p className="text-sm text-destructive">Could not create account. Please try again.</p>}

          <Button type="submit" disabled={isSigningIn} className="w-full py-5 font-semibold mt-6">
            {isSigningIn ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href={Routes.LOGIN} className="text-primary font-bold underline">
            Log in
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}

'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { sdk } from '@/lib/api-client';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const setUser = useAuthStore(state => state.setUser);

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setError('');

    try {
      const response = await sdk.loginApiV1UsersLoginPost({
        body: {
          username: email,
          password,
        },
      });

      setUser(response.data ?? null);
    } catch (e) {
      setError('Invalid email or password.');
      console.error(e);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="text-center pb-2">
        <CardTitle className="text-3xl font-bold py-2">Log in</CardTitle>
        <p className="text-sm text-muted-foreground">Welcome back — pick up where you left off</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
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
                value={password}
                onChange={e => setPassword(e.target.value)}
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

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button
            type="submit"
            className="w-full py-5 font-semibold mt-3"
          >
            Log in
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

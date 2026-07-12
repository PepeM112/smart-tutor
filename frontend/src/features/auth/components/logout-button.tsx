'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useAuthStore } from '@/features/auth/store/auth-store';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

type LogoutButtonProps = {
  collapsed?: boolean;
};

export function LogoutButton({ collapsed = false }: LogoutButtonProps) {
  const router = useRouter();
  const logout = useAuthStore(state => state.logout);

  const handleLogout = async () => {
    try {
      await sdk.usersLogout();
    } catch {
      // Best-effort — clear client state regardless
    }
    logout();
    document.cookie = 'session=; path=/; max-age=0';
    router.push(Routes.LOGIN);
    router.refresh();
  };

  return (
    <ConfirmDialog
      trigger={
        <Button
          variant="ghost"
          title={collapsed ? 'Log out' : undefined}
          className={cn(
            'w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10',
            collapsed ? 'justify-center size-9 px-0' : 'justify-start gap-3 h-9 px-3'
          )}
        >
          <LogOut size={17} className="shrink-0" />
          {!collapsed && <span>Log out</span>}
        </Button>
      }
      title="Log out of SmartTutor?"
      description="Your session will end and you will need to log in again to continue."
      confirmLabel="Log out"
      confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90 border-none"
      onConfirm={handleLogout}
    />
  );
}

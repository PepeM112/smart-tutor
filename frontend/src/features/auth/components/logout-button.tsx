'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useAuthStore } from '@/features/auth/store/auth-store';
import { clearSessionCookie } from '@/features/auth/utils/session-cookie';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

type LogoutButtonProps = {
  collapsed?: boolean;
};

export function LogoutButton({ collapsed = false }: LogoutButtonProps) {
  const router = useRouter();
  const t = useTranslations('auth');
  const logout = useAuthStore(state => state.logout);

  const handleLogout = async () => {
    try {
      await sdk.usersLogout();
    } catch {
      // Best-effort — clear client state regardless
    }
    logout();
    clearSessionCookie();
    router.push(Routes.LOGIN);
    router.refresh();
  };

  return (
    <ConfirmDialog
      trigger={
        <Button
          variant="ghost"
          title={collapsed ? t('log_out') : undefined}
          className={cn(
            'w-full text-sidebar-muted hover:text-red-300 hover:bg-sidebar-accent',
            collapsed ? 'justify-center size-9 px-0' : 'justify-start gap-3 h-9 px-3'
          )}
        >
          <LogOut size={17} className="shrink-0" />
          {!collapsed && <span>{t('log_out')}</span>}
        </Button>
      }
      title={t('log_out_title')}
      description={t('log_out_description')}
      confirmLabel={t('log_out')}
      confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90 border-none"
      onConfirm={handleLogout}
    />
  );
}

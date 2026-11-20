'use client';

import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';

import { useLogout } from '../hooks/useLogout';

type LogoutButtonProps = {
  collapsed?: boolean;
};

export function LogoutButton({ collapsed = false }: LogoutButtonProps) {
  const t = useTranslations();
  const handleLogout = useLogout();

  return (
    <ConfirmDialog
      trigger={
        <Button
          variant="ghost"
          title={collapsed ? t('auth.log_out') : undefined}
          className={cn(
            'w-full text-sidebar-muted hover:text-sidebar-destructive hover:bg-sidebar-accent',
            collapsed ? 'justify-center size-9 px-0' : 'justify-start gap-3 h-9 px-3'
          )}
        >
          <LogOut size={17} className="shrink-0" />
          {!collapsed && <span>{t('auth.log_out')}</span>}
        </Button>
      }
      title={t('auth.log_out_title')}
      description={t('auth.log_out_description')}
      confirmLabel={t('auth.log_out')}
      confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90 border-none"
      onConfirm={handleLogout}
    />
  );
}

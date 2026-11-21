'use client';

import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { sidebarItemClass } from '@/components/layout/sidebarItemClass';
import { SidebarLabel } from '@/components/layout/SidebarLabel';
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
          aria-label={collapsed ? t('auth.log_out') : undefined}
          className={cn(
            sidebarItemClass(),
            'justify-start border-0 font-normal text-sidebar-muted hover:text-sidebar-destructive hover:bg-sidebar-accent dark:hover:bg-sidebar-accent'
          )}
        >
          <LogOut size={16} className="shrink-0" />
          <SidebarLabel collapsed={collapsed}>{t('auth.log_out')}</SidebarLabel>
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

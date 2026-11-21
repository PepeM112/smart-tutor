'use client';

import { LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { useLogout } from '@/features/auth/hooks/useLogout';
import { useAuthStore } from '@/features/auth/store/authStore';
import { cn } from '@/lib/utils';

import { isNavItemActive, MORE_ITEMS, NAV_ITEMS, type NavItem, visibleNavItems } from './navItems';
import { useFavoriteNavItems } from './useFavoriteNavItems';

const ROW_CLASS =
  'flex h-12 w-full items-center gap-3 rounded-lg px-3 text-[15px] outline-none transition-colors hover:bg-muted focus-visible:bg-muted';
const SECTION_TITLE_CLASS = 'px-3 pt-4 pb-1 text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase';

type MobileMoreSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** The rest of the nav below `lg`: the other destinations, the favorite notes, and the account with Log out. */
export function MobileMoreSheet({ open, onOpenChange }: MobileMoreSheetProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const favorites = useFavoriteNavItems();
  const user = useAuthStore(s => s.user);
  const handleLogout = useLogout();
  const close = (): void => onOpenChange(false);
  const name = user?.displayName || user?.username;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent title={t('mobile_nav.more')}>
        <div className="min-h-0 overflow-y-auto px-2 pb-[max(env(safe-area-inset-bottom),1rem)]">
          <ul>
            {visibleNavItems(MORE_ITEMS, user?.role).map(item => (
              <li key={item.labelKey}>
                <NavRow item={item} isActive={isNavItemActive(item, pathname)} onNavigate={close}>
                  {item === NAV_ITEMS.trash && (
                    <span className="ml-auto text-xs text-muted-foreground">{t('mobile_nav.trash_hint')}</span>
                  )}
                </NavRow>
              </li>
            ))}
          </ul>

          {favorites.length > 0 && (
            <section aria-labelledby="more-favorites">
              <h2 id="more-favorites" className={SECTION_TITLE_CLASS}>
                {t('sidebar.favorites')}
              </h2>
              <ul>
                {favorites.map(item => (
                  <li key={item.labelKey}>
                    <NavRow item={item} isActive={isNavItemActive(item, pathname)} onNavigate={close} isSerif />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="more-account">
            <h2 id="more-account" className={SECTION_TITLE_CLASS}>
              {t('mobile_nav.account')}
            </h2>
            {user && (
              <div className="flex items-center gap-3 px-3 py-2">
                <span
                  aria-hidden
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted font-serif text-base text-foreground"
                >
                  {name?.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-medium">{name}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </div>
              </div>
            )}
            <ConfirmDialog
              trigger={
                <button type="button" className={cn(ROW_CLASS, 'cursor-pointer text-destructive')}>
                  <LogOut size={20} className="shrink-0" />
                  {t('auth.log_out')}
                </button>
              }
              title={t('auth.log_out_title')}
              description={t('auth.log_out_description')}
              confirmLabel={t('auth.log_out')}
              confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90 border-none"
              onConfirm={handleLogout}
            />
          </section>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

type NavRowProps = {
  item: NavItem;
  isActive: boolean;
  onNavigate: () => void;
  isSerif?: boolean;
  children?: React.ReactNode;
};

function NavRow({ item, isActive, onNavigate, isSerif = false, children }: NavRowProps) {
  const t = useTranslations();
  const Icon = item.icon;
  if (item.href === null) return null;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={isActive ? 'page' : undefined}
      className={cn(ROW_CLASS, isSerif && 'h-11 font-serif text-base', isActive && 'bg-muted font-medium')}
    >
      <Icon size={20} className={cn('shrink-0', isActive ? 'text-primary' : 'text-muted-foreground')} />
      <span className="truncate">{item.label ?? t(item.labelKey)}</span>
      {children}
    </Link>
  );
}

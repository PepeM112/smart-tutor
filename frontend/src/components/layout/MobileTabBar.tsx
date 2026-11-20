'use client';

import { Ellipsis, Layers, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useIsAssistHidden } from '@/features/assist/store/useAssistHiddenStore';
import { useAssistPanelStore } from '@/features/assist/store/useAssistPanelStore';
import { useAiAvailable } from '@/hooks/useAiAvailable';
import { isExamRoute } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { useOutlineStore } from '@/store/useOutlineStore';

import { MobileMoreSheet } from './MobileMoreSheet';
import { isNavItemActive, MORE_ITEMS, SPACE_ITEMS, TAB_ITEMS } from './navItems';

const TAB_CLASS =
  'my-1 flex h-12 min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50';

/**
 * The nav below `lg`: Dashboard, Files, the Ask AI toggle, a Spaces menu and a More sheet with the rest. It sits
 * on the ground, with no border: the page sheet above it marks the edge. It is out of the way on an exam page,
 * where the attempt must not be left by a stray tap.
 */
export function MobileTabBar() {
  const t = useTranslations();
  const pathname = usePathname();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const setDrawerOpen = useOutlineStore(s => s.setDrawerOpen);
  const aiAvailable = useAiAvailable();
  const isAssistHidden = useIsAssistHidden();
  const isAssistOpen = useAssistPanelStore(s => s.isOpen);
  const toggleAssist = useAssistPanelStore(s => s.toggle);

  if (isExamRoute(pathname)) return null;

  const isMoreActive = MORE_ITEMS.some(item => isNavItemActive(item, pathname));
  const isSpacesActive = SPACE_ITEMS.some(item => isNavItemActive(item, pathname));

  // One drawer at a time: the Contents drawer closes when this sheet opens.
  const openMore = (): void => {
    setDrawerOpen(false);
    setIsMoreOpen(true);
  };

  const handleAssistClick = (): void => {
    setDrawerOpen(false);
    toggleAssist();
  };

  return (
    <>
      <nav
        aria-label={t('mobile_nav.label')}
        className="relative z-30 flex shrink-0 bg-background px-1 pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {TAB_ITEMS.map(item => {
          const Icon = item.icon;
          const isActive = isNavItemActive(item, pathname);
          return (
            <Link
              key={item.labelKey}
              href={item.href ?? '#'}
              aria-current={isActive ? 'page' : undefined}
              className={cn(TAB_CLASS, isActive && 'bg-muted')}
            >
              <TabFace isActive={isActive} icon={<Icon size={22} />} label={t(item.labelKey)} />
            </Link>
          );
        })}
        {/* A page can hide the Assistant (a timed course attempt), as it hides the top bar button on desktop. */}
        {aiAvailable && !isAssistHidden && (
          <button
            type="button"
            aria-pressed={isAssistOpen}
            onClick={handleAssistClick}
            className={cn(TAB_CLASS, isAssistOpen && 'bg-muted')}
          >
            <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Sparkles size={16} />
            </span>
            <TabLabel isActive={isAssistOpen} label={t('mobile_nav.ai')} />
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={cn(TAB_CLASS, isSpacesActive && 'bg-muted')}>
              <TabFace isActive={isSpacesActive} icon={<Layers size={22} />} label={t('sidebar.spaces')} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="center" sideOffset={8} className="w-48">
            {SPACE_ITEMS.map(item => {
              const Icon = item.icon;
              return (
                <DropdownMenuItem key={item.labelKey} asChild className="h-11 gap-3 px-3 text-[15px]">
                  <Link href={item.href ?? '#'} aria-current={isNavItemActive(item, pathname) ? 'page' : undefined}>
                    <Icon size={20} className="text-muted-foreground" />
                    {t(item.labelKey)}
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={isMoreOpen}
          onClick={openMore}
          className={cn(TAB_CLASS, (isMoreActive || isMoreOpen) && 'bg-muted')}
        >
          <TabFace isActive={isMoreActive || isMoreOpen} icon={<Ellipsis size={22} />} label={t('mobile_nav.more')} />
        </button>
      </nav>
      <MobileMoreSheet open={isMoreOpen} onOpenChange={setIsMoreOpen} />
    </>
  );
}

interface TabFaceProps {
  isActive: boolean;
  icon: React.ReactNode;
  label: string;
}

/** The tab button holds the active background. The selected tab has a primary icon and a heavier label. */
function TabFace({ isActive, icon, label }: TabFaceProps) {
  return (
    <>
      <span className={cn('flex h-7 items-center justify-center', isActive ? 'text-primary' : 'text-muted-foreground')}>
        {icon}
      </span>
      <TabLabel isActive={isActive} label={label} />
    </>
  );
}

function TabLabel({ isActive, label }: { isActive: boolean; label: string }) {
  return (
    <span
      className={cn(
        'max-w-full truncate text-[11px]',
        isActive ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground'
      )}
    >
      {label}
    </span>
  );
}

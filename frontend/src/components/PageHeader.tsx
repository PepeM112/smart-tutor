'use client';
import { ArrowLeft, ChevronRight, PanelLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { AssistToggle } from '@/features/assist/components/AssistToggle';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { cn } from '@/lib/utils';
import { type BreadcrumbItem, useBreadcrumbStore } from '@/store/useBreadcrumbStore';
import { useOutlineStore } from '@/store/useOutlineStore';

export function PageHeader() {
  const title = useBreadcrumbStore(s => s.title);
  const crumbs = useBreadcrumbStore(s => s.crumbs);
  const back = useBreadcrumbStore(s => s.back);
  const actions = useBreadcrumbStore(s => s.actions);
  const lead = useBreadcrumbStore(s => s.lead);
  const leadHasHeading = useBreadcrumbStore(s => s.leadHasHeading);
  const router = useRouter();

  return (
    <div className="flex h-14 shrink-0 items-center gap-3 px-4 lg:px-5">
      <OutlineToggle />
      {lead ? (
        <>
          {/* The lead replaces the visible title, but the page still needs its one h1 (unless the lead is it). */}
          {title && !leadHasHeading && <h1 className="sr-only">{title}</h1>}
          {lead}
        </>
      ) : (
        <>
          {back && (
            <Button variant="ghost" size="icon" onClick={() => router.push(back)}>
              <ArrowLeft className="size-5" />
            </Button>
          )}
          <div className="flex items-center gap-1 min-w-0">
            {crumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1 text-sm text-muted-foreground">
                {crumb.href ? (
                  <Link href={crumb.href} className="hover:text-foreground transition-colors">
                    {crumb.label}
                  </Link>
                ) : (
                  <span>{crumb.label}</span>
                )}
                <ChevronRight className="size-3" />
              </span>
            ))}
            {title && <h1 className="truncate font-serif text-[19px] font-medium text-foreground">{title}</h1>}
          </div>
        </>
      )}
      <div className="flex-1" />
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        <AssistToggle />
      </div>
    </div>
  );
}

/** Opens and closes the outline column. It shows only on a page that has one. */
function OutlineToggle() {
  const t = useTranslations('outline');
  const hasOutline = useOutlineStore(s => s.activeKey !== null);
  const isOpen = useOutlineStore(s => s.isOpen);
  const setOpen = useOutlineStore(s => s.setOpen);

  if (!hasOutline) return null;

  const label = isOpen ? t('hide') : t('show');
  return (
    <Button
      variant="ghost"
      size="icon"
      icon={PanelLeft}
      onClick={() => setOpen(!isOpen)}
      aria-pressed={isOpen}
      aria-label={label}
      tooltip={label}
      className={cn(isOpen ? 'bg-muted text-foreground' : 'text-muted-foreground')}
    />
  );
}

// Renders nothing — lets server component pages set the breadcrumb without becoming client components.
export function SetBreadcrumb({ title, crumbs, back }: { title: string; crumbs?: BreadcrumbItem[]; back?: string }) {
  useBreadcrumb(title, crumbs, back);
  return null;
}

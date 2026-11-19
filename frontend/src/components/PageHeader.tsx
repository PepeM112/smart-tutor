'use client';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { AssistToggle } from '@/features/assist/components/AssistToggle';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { type BreadcrumbItem, useBreadcrumbStore } from '@/store/useBreadcrumbStore';

export function PageHeader() {
  const title = useBreadcrumbStore(s => s.title);
  const crumbs = useBreadcrumbStore(s => s.crumbs);
  const back = useBreadcrumbStore(s => s.back);
  const actions = useBreadcrumbStore(s => s.actions);
  const router = useRouter();

  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-hairline px-4 lg:px-5">
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
      <div className="flex-1" />
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        <AssistToggle />
      </div>
    </div>
  );
}

// Renders nothing — lets server component pages set the breadcrumb without becoming client components.
export function SetBreadcrumb({ title, crumbs, back }: { title: string; crumbs?: BreadcrumbItem[]; back?: string }) {
  useBreadcrumb(title, crumbs, back);
  return null;
}

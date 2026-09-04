'use client';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { type BreadcrumbItem, useBreadcrumbStore } from '@/store/useBreadcrumbStore';

// Renders nothing — lets server component pages set the breadcrumb without becoming client components
export function SetBreadcrumb({ title, crumbs, back }: { title: string; crumbs?: BreadcrumbItem[]; back?: string }) {
  useBreadcrumb(title, crumbs, back);
  return null;
}

export function Breadcrumb() {
  const title = useBreadcrumbStore(s => s.title);
  const crumbs = useBreadcrumbStore(s => s.crumbs);
  const back = useBreadcrumbStore(s => s.back);
  const actions = useBreadcrumbStore(s => s.actions);
  const router = useRouter();

  if (!title) return null;

  return (
    <div className="flex items-center gap-3 p-4 lg:p-8">
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
        <h1 className="text-xl lg:text-2xl font-semibold text-foreground truncate text-balance">{title}</h1>
      </div>
      {actions && (
        <>
          <div className="flex-1" />
          <div className="shrink-0 flex items-center gap-2">{actions}</div>
        </>
      )}
    </div>
  );
}

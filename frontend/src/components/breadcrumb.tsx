'use client';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { useBreadcrumbStore } from '@/store/use-breadcrumb-store';

export function Breadcrumb() {
  const { title, crumbs, back } = useBreadcrumbStore();
  const router = useRouter();

  if (!title) return null;

  return (
    <div className="flex items-center gap-3 px-8 py-8">
      {back && (
        <Button variant="ghost" size="icon" onClick={() => router.push(back)}>
          <ArrowLeft className="size-5" />
        </Button>
      )}
      <div className="flex items-center gap-1">
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
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
      </div>
    </div>
  );
}

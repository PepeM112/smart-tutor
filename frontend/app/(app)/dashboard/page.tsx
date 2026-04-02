'use client';
import { useEffect } from 'react';

import { useBreadcrumbStore } from '@/store/use-breadcrumb-store';

export default function DashboardPage() {
  const { set, reset } = useBreadcrumbStore();

  useEffect(() => {
    set('Dashboard');
    return () => reset();
  }, [set, reset]);

  return (
    <div className="px-8 pb-8">
      <p className="text-muted-foreground">Your learning overview will appear here.</p>
    </div>
  );
}

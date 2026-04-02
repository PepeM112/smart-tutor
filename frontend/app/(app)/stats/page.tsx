'use client';
import { useEffect } from 'react';

import { useBreadcrumbStore } from '@/store/use-breadcrumb-store';

export default function StatsPage() {
  const { set, reset } = useBreadcrumbStore();

  useEffect(() => {
    set('Progress Stats');
    return () => reset();
  }, [set, reset]);

  return (
    <p className="text-muted-foreground">Charts and streaks will be displayed here.</p>
  );
}

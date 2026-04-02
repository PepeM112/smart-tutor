'use client';
import { useEffect } from 'react';

import { useBreadcrumbStore } from '@/store/use-breadcrumb-store';

export default function HistoryPage() {
  const { set, reset } = useBreadcrumbStore();

  useEffect(() => {
    set('Exam History');
    return () => reset();
  }, [set, reset]);

  return (
    <p className="text-muted-foreground">A chronological log of your past sessions.</p>
  );
}

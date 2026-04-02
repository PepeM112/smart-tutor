'use client';
import { useEffect } from 'react';

import { useBreadcrumbStore } from '@/store/use-breadcrumb-store';

export default function PracticePage() {
  const { set, reset } = useBreadcrumbStore();

  useEffect(() => {
    set('Practice Tests');
    return () => reset();
  }, [set, reset]);

  return (
    <p className="text-muted-foreground">Choose a test to practice manually.</p>
  );
}

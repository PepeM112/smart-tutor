'use client';
import { useEffect } from 'react';

import { useBreadcrumbStore } from '@/store/use-breadcrumb-store';

export default function ReviewPage() {
  const { set, reset } = useBreadcrumbStore();

  useEffect(() => {
    set('Review Now');
    return () => reset();
  }, [set, reset]);

  return (
    <p className="text-muted-foreground">Your spaced-repetition session will start here.</p>
  );
}

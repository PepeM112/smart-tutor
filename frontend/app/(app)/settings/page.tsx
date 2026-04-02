'use client';
import { useEffect } from 'react';

import { useBreadcrumbStore } from '@/store/use-breadcrumb-store';

export default function SettingsPage() {
  const { set, reset } = useBreadcrumbStore();

  useEffect(() => {
    set('Profile & Settings');
    return () => reset();
  }, [set, reset]);

  return <p className="text-muted-foreground">Account settings and SRS preferences.</p>;
}

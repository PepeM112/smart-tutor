'use client';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Routes } from '@/lib/routes';
import { useBreadcrumbStore } from '@/store/use-breadcrumb-store';

export default function TestsPage() {
  const { set, reset } = useBreadcrumbStore();
  const router = useRouter();

  useEffect(() => {
    set('My Tests');
    return () => reset();
  }, [set, reset]);

  return (
    <div className="px-8 pb-8">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground">Create and manage your question sets here.</p>
        <Button size="lg" icon={Plus} onClick={() => router.push(Routes.TEST_NEW)}>
          Create Test
        </Button>
      </div>
    </div>
  );
}

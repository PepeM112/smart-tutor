'use client';

import { Dumbbell } from 'lucide-react';
import { useEffect } from 'react';

import { Card, CardContent } from '@/components/ui/card';
import { useBreadcrumbStore } from '@/store/use-breadcrumb-store';

export default function PracticePage() {
  const { set, reset } = useBreadcrumbStore();

  useEffect(() => {
    set('Practice');
    return () => reset();
  }, [set, reset]);

  return (
    <div className="flex items-center justify-center py-24">
      <Card className="max-w-sm text-center">
        <CardContent className="flex flex-col items-center gap-4 pt-6">
          <div className="flex items-center justify-center size-12 rounded-full bg-muted">
            <Dumbbell className="size-6 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-foreground">Practice Mode</p>
            <p className="text-sm text-muted-foreground">
              Answer questions one by one with instant feedback. Coming soon.
            </p>
          </div>
          <span className="text-[10px] font-medium bg-muted-foreground/20 px-2 py-0.5 rounded-full text-muted-foreground">
            Coming soon
          </span>
        </CardContent>
      </Card>
    </div>
  );
}

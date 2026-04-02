import { Plus } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Routes } from '@/lib/routes';

export default function TestsPage() {
  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">My Tests</h1>
          <p className="mt-2 text-muted-foreground">Create and manage your question sets here.</p>
        </div>
        <Button className="pr-4" size="lg" asChild>
          <Link href={Routes.TEST_NEW}>
            <Plus data-icon="inline-start" />
            Create Test
          </Link>
        </Button>
      </div>
    </div>
  );
}

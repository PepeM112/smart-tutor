import { Plus } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

export default function TestsPage() {
  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">My Tests</h1>
          <p className="mt-2 text-muted-foreground">Create and manage your question sets here.</p>
        </div>
        <Button size="lg" asChild>
          <Link href="/tests/new">
            <Plus data-icon="inline-start" />
            Create Test
          </Link>
        </Button>
      </div>
    </div>
  );
}

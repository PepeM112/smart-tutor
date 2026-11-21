'use client';

import { Inbox } from 'lucide-react';

import { CopyChip } from '@/components/shared/CopyChip';
import { DialogLoading } from '@/components/shared/DialogLoading';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { QueryState } from '@/components/shared/QueryState';
import { Button } from '@/components/ui/button';

import { SandboxDemo, SandboxSection } from './SandboxSection';

export function FeedbackSection() {
  return (
    <SandboxSection id="feedback" title="Empty, loading and error states">
      <SandboxDemo label="Empty state">
        <div className="flex flex-col items-center gap-3 rounded-xl bg-muted/40 px-6 py-12 text-center">
          <Inbox className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium text-foreground">No tests yet</p>
          <Button variant="outline">Create a test</Button>
        </div>
      </SandboxDemo>

      <SandboxDemo label="Query state">
        <div className="grid gap-4 sm:grid-cols-3">
          <QueryState isLoading isError={false} errorMessage="Could not load the tests.">
            <p>Loaded</p>
          </QueryState>
          <QueryState isLoading={false} isError errorMessage="Could not load the tests.">
            <p>Loaded</p>
          </QueryState>
          <QueryState isLoading={false} isError={false} errorMessage="Could not load the tests.">
            <p className="py-12 text-center text-sm">Loaded content</p>
          </QueryState>
        </div>
      </SandboxDemo>

      <SandboxDemo label="Loading spinner and dialog loading">
        <div className="grid gap-4 sm:grid-cols-2">
          <LoadingSpinner />
          <DialogLoading title="Grading your answer" messages={['Reading the answer', 'Checking the rubric']} />
        </div>
      </SandboxDemo>

      <SandboxDemo label="Copy chip">
        <CopyChip text="K7P2-XQ9M" label="Copy code" />
      </SandboxDemo>
    </SandboxSection>
  );
}

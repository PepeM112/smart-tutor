import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function QuestionBlockAction({ onRemove }: { onRemove: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onRemove}
      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
    >
      <Trash2 className="size-4.5" />
    </Button>
  );
}

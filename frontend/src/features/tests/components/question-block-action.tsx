import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

export function QuestionBlockAction({
  onRemove,
  accepted,
  onToggleAccept,
}: {
  onRemove: () => void;
  accepted?: boolean;
  onToggleAccept?: () => void;
}) {
  if (accepted !== undefined) {
    return <Switch size="sm" checked={accepted} onCheckedChange={onToggleAccept} />;
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onRemove}
      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
    >
      <Trash2 className="size-4" />
    </Button>
  );
}

import { HoverHint } from '@/components/ui/hover-hint';

import type { ReactNode } from 'react';

type PopoverButtonProps = {
  label: string;
  shortcut?: string;
  onClick: () => void;
  children: ReactNode;
};

export function PopoverButton({ label, shortcut, onClick, children }: PopoverButtonProps) {
  return (
    <HoverHint label={label} shortcut={shortcut}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-foreground/70 transition-colors duration-75 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
      >
        {children}
      </button>
    </HoverHint>
  );
}

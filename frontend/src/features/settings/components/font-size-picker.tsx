'use client';

import { Check } from 'lucide-react';

import { useFontSize } from '@/hooks/use-font-size';
import { fontSizes } from '@/lib/font-size';
import { cn } from '@/lib/utils';

export function FontSizePicker() {
  const { fontSizeId, setFontSize } = useFontSize();

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Font Size</h3>
        <p className="text-xs text-muted-foreground">Adjust the interface text size.</p>
      </div>

      <div className="flex gap-2">
        {fontSizes.map(option => {
          const isActive = fontSizeId === option.id;

          return (
            <button
              key={option.id}
              onClick={() => setFontSize(option.id)}
              className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all',
                'ring-1 ring-foreground/10 hover:ring-foreground/20',
                isActive && 'ring-2 ring-primary'
              )}
            >
              <span>{option.label}</span>
              {isActive && <Check className="size-3.5 text-primary" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

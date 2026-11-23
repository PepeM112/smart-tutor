'use client';

import { Eye, Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { RichText } from '@/components/RichText';
import { AutoTextarea } from '@/components/shared/AutoTextarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Props = Omit<React.ComponentProps<typeof AutoTextarea>, 'value'> & { value: string };

/** Auto-growing Markdown field with a Write/Preview toggle. `className` styles the wrapper. */
export function MarkdownTextarea({ value, className, placeholder, ...props }: Props) {
  const t = useTranslations();
  const [isPreview, setIsPreview] = useState(false);

  return (
    <div className={cn('relative', className)}>
      {isPreview ? (
        <div className="min-h-8 rounded-md border border-input px-2.5 py-1.5 pr-9 text-sm">
          {value.trim() ? <RichText text={value} /> : <span className="text-muted-foreground">{placeholder}</span>}
        </div>
      ) : (
        <AutoTextarea {...props} value={value} placeholder={placeholder} className="pr-9" />
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={isPreview ? t('common.write') : t('common.preview')}
        aria-pressed={isPreview}
        onClick={() => setIsPreview(prev => !prev)}
        className="absolute top-1 right-1 text-muted-foreground"
      >
        {isPreview ? <Pencil /> : <Eye />}
      </Button>
    </div>
  );
}

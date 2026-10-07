'use client';

import { Star } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { useFileTree } from '@/features/files/hooks/useFileTree';
import { cn } from '@/lib/utils';

import { useToggleFavorite } from '../hooks/useToggleFavorite';

type Props = {
  noteId: string;
  /** Used until the file tree has loaded. The tree is the live source (it updates optimistically). */
  fallbackIsFavorite?: boolean;
};

/** Star toggle for a note. It is a plain button next to the other header actions. */
export function FavoriteButton({ noteId, fallbackIsFavorite = false }: Props) {
  const t = useTranslations();
  const { notes } = useFileTree();
  const { toggleFavorite } = useToggleFavorite();

  const isFavorite = notes.find(n => n.id === noteId)?.isFavorite ?? fallbackIsFavorite;
  const label = isFavorite ? t('notes.remove_favorite') : t('notes.add_favorite');

  return (
    <Button
      variant="ghost"
      size="icon"
      tooltip={label}
      aria-label={label}
      aria-pressed={isFavorite}
      onClick={() => toggleFavorite({ id: noteId, isFavorite: !isFavorite })}
    >
      <Star className={cn('size-[18px]', isFavorite && 'fill-current text-feedback-partial')} />
    </Button>
  );
}

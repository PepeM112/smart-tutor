'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';

type Props = {
  page: number;
  perPage: number;
  total: number;
  onPageChange: (page: number) => void;
};

export function Pagination({ page, perPage, total, onPageChange }: Props) {
  const totalPages = Math.ceil(total / perPage);
  if (totalPages <= 1) return null;

  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  return (
    <div className="flex items-center justify-between pt-2">
      <p className="text-xs text-muted-foreground tabular-nums">
        {from}–{to} / {total}
      </p>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon-lg" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="px-2 text-sm tabular-nums text-muted-foreground">
          {page} / {totalPages}
        </span>
        <Button variant="outline" size="icon-lg" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { SpaceItemKind, type SpaceItemRead, type SpaceItemUpdate } from '@/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { fromLocalInputValue, toLocalInputValue } from '../lib/schedule';

type Props = {
  item: SpaceItemRead;
  /** The item is in a classroom: only then it has a due date. */
  isClassroom: boolean;
  /** `onError` runs when the save is refused, so a field can put the saved value back. */
  onUpdate: (body: SpaceItemUpdate, onError?: () => void) => void;
};

/**
 * The schedule of one draft item. Each change saves at once.
 * Visible from: any item. Due: classroom items. Opens / closes: TEST items.
 */
export function ItemSchedulePanel({ item, isClassroom, onUpdate }: Props) {
  const t = useTranslations();
  const isTest = item.kind === SpaceItemKind.TEST;

  return (
    <div
      className="mb-2 ml-8 flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
      data-testid="schedule-panel"
    >
      <h4 className="text-sm font-medium text-foreground">{t('courses.schedule_title')}</h4>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <DateTimeField
          id={`visible-${item.id}`}
          label={t('courses.schedule_visible_from')}
          hint={t('courses.schedule_visible_from_hint')}
          value={item.visibleFrom ?? null}
          onCommit={(value, onRefused) => onUpdate({ visibleFrom: value }, onRefused)}
        />
        {isClassroom && (
          <DateTimeField
            id={`due-${item.id}`}
            label={t('courses.schedule_due')}
            value={item.dueAt ?? null}
            onCommit={(value, onRefused) => onUpdate({ dueAt: value }, onRefused)}
          />
        )}
        {isTest && (
          <>
            <DateTimeField
              id={`opens-${item.id}`}
              label={t('courses.schedule_opens')}
              value={item.opensAt ?? null}
              onCommit={(value, onRefused) => onUpdate({ opensAt: value }, onRefused)}
            />
            <DateTimeField
              id={`closes-${item.id}`}
              label={t('courses.schedule_closes')}
              value={item.closesAt ?? null}
              onCommit={(value, onRefused) => onUpdate({ closesAt: value }, onRefused)}
            />
          </>
        )}
      </div>
    </div>
  );
}

type DateTimeFieldProps = {
  id: string;
  label: string;
  hint?: string;
  value: Date | null;
  /** Runs on blur, only when the date changed. `null` = the field is empty (the date is cleared). */
  onCommit: (value: Date | null, onRefused: () => void) => void;
};

/**
 * A date-time field that saves on blur. It is uncontrolled and keyed by the saved value, so a refetch
 * puts the saved value back. A refused save does not change the saved value, so it raises a
 * revision that remounts the field (same as the attempt rule fields).
 */
function DateTimeField({ id, label, hint, value, onCommit }: DateTimeFieldProps) {
  const [revision, setRevision] = useState(0);
  const saved = toLocalInputValue(value);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        key={`${saved}-${revision}`}
        id={id}
        type="datetime-local"
        defaultValue={saved}
        onBlur={e => {
          // A half-typed date reads as '' with `badInput`. It is not "clear": put the saved value back.
          if (e.target.validity.badInput) {
            setRevision(r => r + 1);
            return;
          }
          if (e.target.value !== saved) onCommit(fromLocalInputValue(e.target.value), () => setRevision(r => r + 1));
        }}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

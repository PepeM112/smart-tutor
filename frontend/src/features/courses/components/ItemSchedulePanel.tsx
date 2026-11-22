'use client';

import { useTranslations } from 'next-intl';

import { SpaceItemKind, type SpaceItemRead, type SpaceItemUpdate } from '@/client';
import { DateTimeField } from '@/components/shared/DateTimeField';
import { Label } from '@/components/ui/label';

type Props = {
  item: SpaceItemRead;
  /** The item is in a classroom: only then it has a due date. */
  isClassroom: boolean;
  onUpdate: (body: SpaceItemUpdate) => void;
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
      className="my-2 ml-8 flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
      data-testid="schedule-panel"
    >
      <h4 className="text-sm font-medium text-foreground">{t('courses.schedule_title')}</h4>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ScheduleField
          id={`visible-${item.id}`}
          label={t('courses.schedule_visible_from')}
          hint={t('courses.schedule_visible_from_hint')}
          value={item.visibleFrom ?? null}
          onCommit={value => onUpdate({ visibleFrom: value })}
        />
        {isClassroom && (
          <ScheduleField
            id={`due-${item.id}`}
            label={t('courses.schedule_due')}
            value={item.dueAt ?? null}
            onCommit={value => onUpdate({ dueAt: value })}
          />
        )}
        {isTest && (
          <>
            <ScheduleField
              id={`opens-${item.id}`}
              label={t('courses.schedule_opens')}
              value={item.opensAt ?? null}
              onCommit={value => onUpdate({ opensAt: value })}
            />
            <ScheduleField
              id={`closes-${item.id}`}
              label={t('courses.schedule_closes')}
              value={item.closesAt ?? null}
              onCommit={value => onUpdate({ closesAt: value })}
            />
          </>
        )}
      </div>
    </div>
  );
}

interface ScheduleFieldProps {
  id: string;
  label: string;
  hint?: string;
  value: Date | null;
  /** `null` = the date is cleared. */
  onCommit: (value: Date | null) => void;
}

/**
 * The field shows the saved value only. A refused save leaves that value as it was, so the field needs
 * no reset: the popup keeps its draft until Done and drops it on any other close.
 */
function ScheduleField({ id, label, hint, value, onCommit }: ScheduleFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <DateTimeField
        id={id}
        value={value?.toISOString() ?? null}
        onCommit={iso => onCommit(iso ? new Date(iso) : null)}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

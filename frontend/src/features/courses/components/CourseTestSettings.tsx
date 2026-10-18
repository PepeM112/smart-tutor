'use client';

import { ArrowDown, ArrowUp, ClipboardCopy, ClipboardPlus, Pencil, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { RevealAnswers, type SpaceItemRead, type SpaceItemUpdate } from '@/client';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';

import { parsePolicyNumber, thresholdToPercent } from '../lib/policy';

const REVEAL_LABELS: Record<RevealAnswers, string> = {
  [RevealAnswers.ALWAYS]: 'courses.reveal_always',
  [RevealAnswers.AFTER_PASS_OR_LAST]: 'courses.reveal_after_pass_or_last',
  [RevealAnswers.NEVER]: 'courses.reveal_never',
};

type Props = {
  item: SpaceItemRead;
  /** Off for the variant buttons while another write runs (they build on the saved order). The rule fields stay on: the writes queue. */
  disabled: boolean;
  /** `onError` runs when the save is refused, so a field can put the saved value back. */
  onUpdate: (body: SpaceItemUpdate, onError?: () => void) => void;
  /** Opens the add dialog for this item: a new test, or a copy of a personal one. */
  onAddVariant: (action: 'create' | 'copy') => void;
  onReorderVariants: (testIds: string[]) => void;
  onRemoveVariant: (testId: string) => void;
  onEditVariant: (testId: string) => void;
};

/** The attempt rules and the variants of one TEST item in the draft. Each change saves at once. */
export function CourseTestSettings({
  item,
  disabled,
  onUpdate,
  onAddVariant,
  onReorderVariants,
  onRemoveVariant,
  onEditVariant,
}: Props) {
  const t = useTranslations();
  const variants = item.variants ?? [];
  const testIds = variants.map(variant => variant.testId);

  const move = (index: number, delta: -1 | 1): string[] => {
    const next = [...testIds];
    const [moved] = next.splice(index, 1);
    next.splice(index + delta, 0, moved);
    return next;
  };

  return (
    <div
      className="mb-2 ml-8 flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
      data-testid="test-settings"
    >
      <section className="flex flex-col gap-3">
        <h4 className="text-sm font-medium text-foreground">{t('courses.policy_title')}</h4>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <PolicyField
            id={`pass-${item.id}`}
            label={t('courses.policy_pass_threshold')}
            // Required: an empty field restores the saved value.
            value={thresholdToPercent(item.passThreshold)}
            max={100}
            onCommit={(value, onRefused) => value !== null && onUpdate({ passThreshold: value / 100 }, onRefused)}
          />
          <PolicyField
            id={`attempts-${item.id}`}
            label={t('courses.policy_max_attempts')}
            value={item.maxAttempts ?? null}
            placeholder={t('courses.policy_no_limit')}
            onCommit={(value, onRefused) => onUpdate({ maxAttempts: value }, onRefused)}
          />
          <PolicyField
            id={`cooldown-${item.id}`}
            label={t('courses.policy_cooldown_hours')}
            value={item.cooldownHours ?? null}
            placeholder={t('courses.policy_no_limit')}
            onCommit={(value, onRefused) => onUpdate({ cooldownHours: value }, onRefused)}
          />
          <PolicyField
            id={`time-${item.id}`}
            label={t('courses.policy_time_limit')}
            value={item.timeLimitMinutes ?? null}
            placeholder={t('courses.policy_no_limit')}
            onCommit={(value, onRefused) => onUpdate({ timeLimitMinutes: value }, onRefused)}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`reveal-${item.id}`}>{t('courses.policy_reveal_answers')}</Label>
            <NativeSelect
              id={`reveal-${item.id}`}
              value={item.revealAnswers ?? RevealAnswers.AFTER_PASS_OR_LAST}
              onChange={e => onUpdate({ revealAnswers: Number(e.target.value) })}
            >
              {Object.entries(REVEAL_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {t(label)}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-medium text-foreground">{t('courses.variants_title')}</h4>
            <p className="text-xs text-muted-foreground">{t('courses.variants_hint')}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={ClipboardPlus}
              disabled={disabled}
              onClick={() => onAddVariant('create')}
            >
              {t('courses.variant_add_new')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={ClipboardCopy}
              disabled={disabled}
              onClick={() => onAddVariant('copy')}
            >
              {t('courses.variant_add_library')}
            </Button>
          </div>
        </div>
        <ul className="flex flex-col gap-1" data-testid="variant-list">
          {variants.map((variant, index) => (
            <li key={variant.testId} className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-1.5 text-sm">
              <span className="text-xs text-muted-foreground tabular-nums">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate">{variant.title}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                tooltip={t('courses.variant_edit')}
                aria-label={t('courses.variant_edit')}
                onClick={() => onEditVariant(variant.testId)}
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                tooltip={t('courses.variant_move_up')}
                aria-label={t('courses.variant_move_up')}
                disabled={disabled || index === 0}
                onClick={() => onReorderVariants(move(index, -1))}
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                tooltip={t('courses.variant_move_down')}
                aria-label={t('courses.variant_move_down')}
                disabled={disabled || index === variants.length - 1}
                onClick={() => onReorderVariants(move(index, 1))}
              >
                <ArrowDown />
              </Button>
              <ConfirmDialog
                trigger={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    // The last variant cannot go: a test item needs one test.
                    tooltip={
                      variants.length === 1 ? t('courses.variant_last_cannot_remove') : t('courses.variant_remove')
                    }
                    aria-label={t('courses.variant_remove')}
                    disabled={disabled || variants.length === 1}
                  >
                    <Trash2 />
                  </Button>
                }
                title={t('courses.variant_remove_title')}
                description={t('courses.variant_remove_description')}
                confirmLabel={t('courses.variant_remove_confirm')}
                onConfirm={() => onRemoveVariant(variant.testId)}
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

type PolicyFieldProps = {
  id: string;
  label: string;
  value: number | null;
  placeholder?: string;
  max?: number;
  /** Runs on blur, only when the value changed. `null` = the field is empty (no limit). `onRefused` puts the saved value back. */
  onCommit: (value: number | null, onRefused: () => void) => void;
};

/**
 * A number field that saves on blur. It is uncontrolled and keyed by the saved value, so a refetch
 * puts the saved value back. A refused save does not change the saved value, so it raises a
 * revision that remounts the field (F18).
 */
function PolicyField({ id, label, value, placeholder, max, onCommit }: PolicyFieldProps) {
  const [revision, setRevision] = useState(0);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        key={`${String(value)}-${revision}`}
        id={id}
        type="number"
        min={1}
        max={max}
        step={1}
        defaultValue={value ?? ''}
        placeholder={placeholder}
        onBlur={e => {
          const next = parsePolicyNumber(e.target.value, max);
          if (next.isValid && next.value !== value) onCommit(next.value, () => setRevision(r => r + 1));
          else if (!next.isValid) e.target.value = String(value ?? '');
        }}
      />
    </div>
  );
}

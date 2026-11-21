'use client';

import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

import type { AiToolPermissionRead } from '@/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

import { SettingsSection } from './SettingsSection';

import type { PermissionDraft } from '../utils';

type ToolKind = AiToolPermissionRead['kind'];

const GROUPS: { kind: ToolKind; titleKey: string }[] = [
  { kind: 'read', titleKey: 'settings.ai_permissions_read' },
  { kind: 'write', titleKey: 'settings.ai_permissions_write' },
];

type AiPermissionsSectionProps = {
  /** Server permissions. A change shows at once, before the backend answers. */
  permissions: AiToolPermissionRead[] | undefined;
  isLoading: boolean;
  isError: boolean;
  /** Reports changed tools as `tool name -> autoApprove`. The page saves them. */
  onChange: (changes: PermissionDraft) => void;
};

export function AiPermissionsSection({ permissions, isLoading, isError, onChange }: AiPermissionsSectionProps) {
  const t = useTranslations();

  return (
    <SettingsSection title={t('settings.ai_permissions')} description={t('settings.ai_permissions_description')}>
      {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
      {isError && <p className="text-sm text-destructive">{t('settings.ai_permissions_load_failed')}</p>}
      {permissions && (
        <div className="divide-y divide-hairline border-y border-hairline">
          {GROUPS.map(group => (
            <PermissionGroup
              key={group.kind}
              title={t(group.titleKey)}
              tools={permissions.filter(p => p.kind === group.kind)}
              onChange={onChange}
            />
          ))}
        </div>
      )}
    </SettingsSection>
  );
}

type PermissionGroupProps = {
  title: string;
  tools: AiToolPermissionRead[];
  onChange: (changes: PermissionDraft) => void;
};

function PermissionGroup({ title, tools, onChange }: PermissionGroupProps) {
  const t = useTranslations('settings');
  const [isOpen, setIsOpen] = useState(false);
  const checkboxId = useId();
  const listId = useId();
  if (tools.length === 0) return null;

  const autoCount = tools.filter(tool => tool.autoApprove).length;
  // A Checkbox (not a Switch) because only it has a native mixed state.
  const masterState: boolean | 'indeterminate' =
    autoCount === tools.length ? true : autoCount === 0 ? false : 'indeterminate';

  // From the mixed state, the first click allows every tool of the group.
  const toggleGroup = (): void => {
    const next = autoCount < tools.length;
    onChange(Object.fromEntries(tools.filter(tool => tool.autoApprove !== next).map(tool => [tool.name, next])));
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
        <p className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-foreground">{title}</span>
          <span className="text-sm text-muted-foreground">
            {t('ai_permissions_tool_count', { count: tools.length })}
          </span>
        </p>
        <div className="ml-auto flex items-center gap-2">
          <Checkbox
            id={checkboxId}
            checked={masterState}
            onCheckedChange={toggleGroup}
            aria-label={t('ai_permissions_group_toggle', { group: title })}
          />
          <Label htmlFor={checkboxId} className="font-normal">
            {t('ai_permissions_run_without_asking')}
          </Label>
          <Button
            variant="ghost"
            size="icon"
            aria-expanded={isOpen}
            aria-controls={listId}
            aria-label={t(isOpen ? 'ai_permissions_group_hide' : 'ai_permissions_group_show', { group: title })}
            onClick={() => setIsOpen(open => !open)}
          >
            <ChevronDown className={cn('transition-transform', isOpen && 'rotate-180')} />
          </Button>
        </div>
      </div>
      <ul id={listId} hidden={!isOpen} className="divide-y divide-hairline">
        {tools.map(tool => (
          <PermissionRow key={tool.name} tool={tool} onChange={value => onChange({ [tool.name]: value })} />
        ))}
      </ul>
    </div>
  );
}

type PermissionRowProps = {
  tool: AiToolPermissionRead;
  onChange: (value: boolean) => void;
};

function PermissionRow({ tool, onChange }: PermissionRowProps) {
  const t = useTranslations();
  const label = t(`settings.ai_permissions_tool_names.${tool.name}`);
  const descriptionKey = `assist.tool_descriptions.${tool.name}`;

  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm text-foreground">{label}</p>
        {t.has(descriptionKey) && <p className="text-xs text-muted-foreground">{t(descriptionKey)}</p>}
      </div>
      <Switch
        checked={tool.autoApprove}
        onCheckedChange={onChange}
        aria-label={t('settings.ai_permissions_tool_toggle', { tool: label })}
      />
    </li>
  );
}

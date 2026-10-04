'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import type { AiToolPermissionRead } from '@/client';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { AI_PERMISSIONS_QUERY_KEY, useAiToolPermissions } from '@/features/assist/hooks/useAiToolPermissions';
import { sdk } from '@/lib/apiClient';

import { SettingsSection } from './SettingsSection';

type ToolKind = AiToolPermissionRead['kind'];

const GROUPS: { kind: ToolKind; titleKey: string; descriptionKey: string }[] = [
  {
    kind: 'read',
    titleKey: 'settings.ai_permissions_read',
    descriptionKey: 'settings.ai_permissions_read_description',
  },
  {
    kind: 'write',
    titleKey: 'settings.ai_permissions_write',
    descriptionKey: 'settings.ai_permissions_write_description',
  },
];

export function AiPermissionsSection() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { data: permissions, isLoading, isError } = useAiToolPermissions();

  const { mutate: savePermissions, isPending: isSaving } = useMutation({
    mutationFn: async (overrides: Record<string, boolean>) => {
      const result = await sdk.usersUpdateAiToolPermissions({ body: { permissions: overrides } });
      return result.data ?? [];
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: AI_PERMISSIONS_QUERY_KEY });
      toast.success(t('settings.settings_saved'));
    },
    onError: () => {
      toast.error(t('settings.ai_permissions_save_failed'));
    },
  });

  return (
    <SettingsSection title={t('settings.ai_permissions')} description={t('settings.ai_permissions_description')}>
      {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
      {isError && <p className="text-sm text-destructive">{t('settings.ai_permissions_load_failed')}</p>}
      {permissions && (
        <div className="space-y-4">
          {GROUPS.map(group => (
            <PermissionGroup
              key={group.kind}
              title={t(group.titleKey)}
              description={t(group.descriptionKey)}
              tools={permissions.filter(p => p.kind === group.kind)}
              disabled={isSaving}
              onChange={savePermissions}
            />
          ))}
        </div>
      )}
    </SettingsSection>
  );
}

type PermissionGroupProps = {
  title: string;
  description: string;
  tools: AiToolPermissionRead[];
  disabled: boolean;
  onChange: (overrides: Record<string, boolean>) => void;
};

function PermissionGroup({ title, description, tools, disabled, onChange }: PermissionGroupProps) {
  const t = useTranslations('settings');
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
    <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
      <div className="flex items-start gap-3 border-b border-border px-4 py-3">
        <Checkbox
          className="mt-0.5"
          checked={masterState}
          disabled={disabled}
          onCheckedChange={toggleGroup}
          aria-label={t('ai_permissions_group_toggle', { group: title })}
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <ul className="divide-y divide-border">
        {tools.map(tool => (
          <PermissionRow
            key={tool.name}
            tool={tool}
            disabled={disabled}
            onChange={value => onChange({ [tool.name]: value })}
          />
        ))}
      </ul>
    </div>
  );
}

type PermissionRowProps = {
  tool: AiToolPermissionRead;
  disabled: boolean;
  onChange: (value: boolean) => void;
};

function PermissionRow({ tool, disabled, onChange }: PermissionRowProps) {
  const t = useTranslations();
  const label = t(`settings.ai_permissions_tool_names.${tool.name}`);
  const descriptionKey = `assist.tool_descriptions.${tool.name}`;

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm text-foreground">{label}</p>
        {t.has(descriptionKey) && <p className="text-xs text-muted-foreground">{t(descriptionKey)}</p>}
      </div>
      <Switch
        checked={tool.autoApprove}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-label={t('settings.ai_permissions_tool_toggle', { tool: label })}
      />
    </li>
  );
}

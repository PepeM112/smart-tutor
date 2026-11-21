'use client';

import { useState } from 'react';

import { AutoTextarea } from '@/components/shared/AutoTextarea';
import { InlineRename } from '@/components/shared/InlineRename';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

import { SandboxDemo, SandboxSection } from './SandboxSection';

export function FormFieldsSection() {
  const [isSwitchOn, setIsSwitchOn] = useState(true);
  const [isChecked, setIsChecked] = useState(true);
  const [autoText, setAutoText] = useState('This field grows with its text.');
  const [name, setName] = useState('Biology notes');
  const [isRenaming, setIsRenaming] = useState(false);

  return (
    <SandboxSection id="form-fields" title="Form fields">
      <div className="grid gap-6 sm:grid-cols-2">
        <SandboxDemo label="Input">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="sandbox-input">Title</Label>
              <Input id="sandbox-input" placeholder="A short title" />
            </div>
            <Input aria-label="Disabled input" disabled defaultValue="Disabled" />
            <Input aria-label="Invalid input" aria-invalid defaultValue="Invalid" />
          </div>
        </SandboxDemo>

        <SandboxDemo label="Textarea">
          <div className="space-y-3">
            <Textarea aria-label="Textarea" placeholder="A longer answer" rows={3} />
            <AutoTextarea
              aria-label="Auto-growing textarea"
              value={autoText}
              onChange={e => setAutoText(e.target.value)}
            />
          </div>
        </SandboxDemo>

        <SandboxDemo label="Native select">
          <NativeSelect aria-label="Native select" defaultValue="week">
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </NativeSelect>
        </SandboxDemo>

        <SandboxDemo label="Switch and checkbox">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch id="sandbox-switch" checked={isSwitchOn} onCheckedChange={setIsSwitchOn} />
              <Label htmlFor="sandbox-switch">Default</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="sandbox-switch-sm" size="sm" />
              <Label htmlFor="sandbox-switch-sm">Small</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="sandbox-checkbox"
                checked={isChecked}
                onCheckedChange={value => setIsChecked(value === true)}
              />
              <Label htmlFor="sandbox-checkbox">Checkbox</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="sandbox-checkbox-off" disabled />
              <Label htmlFor="sandbox-checkbox-off">Disabled</Label>
            </div>
          </div>
        </SandboxDemo>

        <SandboxDemo label="Inline rename">
          {isRenaming ? (
            <InlineRename
              initialValue={name}
              maxLength={100}
              onSave={value => {
                setName(value);
                setIsRenaming(false);
              }}
              onCancel={() => setIsRenaming(false)}
            />
          ) : (
            <button
              type="button"
              className="rounded text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
              onClick={() => setIsRenaming(true)}
            >
              {name}
            </button>
          )}
        </SandboxDemo>
      </div>
    </SandboxSection>
  );
}

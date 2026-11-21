'use client';

import { useState } from 'react';

import { AutoTextarea } from '@/components/shared/AutoTextarea';
import { InlineRename } from '@/components/shared/InlineRename';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

import { SandboxDemo, SandboxSection } from './SandboxSection';

const SELECT_OPTIONS = ['day', 'week', 'month'].map(unit => (
  <SelectItem key={unit} value={unit} className="capitalize">
    {unit}
  </SelectItem>
));

export function FormFieldsSection() {
  const [isSelectOpen, setIsSelectOpen] = useState(false);
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

        <SandboxDemo label="Select">
          <div className="grid max-w-sm gap-3">
            <Select defaultValue="week">
              <SelectTrigger aria-label="Select closed">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>{SELECT_OPTIONS}</SelectContent>
            </Select>
            {/* A button opens the list: an always-open Radix list would lock the whole page */}
            <Select value="week" open={isSelectOpen} onOpenChange={setIsSelectOpen}>
              <SelectTrigger aria-label="Select open">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>{SELECT_OPTIONS}</SelectContent>
            </Select>
            <Button type="button" variant="outline" size="sm" onClick={() => setIsSelectOpen(true)}>
              Open the select
            </Button>
          </div>
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

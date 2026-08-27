'use client';

import { Info, Star, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { buttonVariants } from '@/components/ui/button';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip } from '@/components/ui/tooltip';
import { AssistTurnRow } from '@/features/assist/components/AssistTurnRow';
import type { AssistTurn } from '@/features/assist/types';
import { ThemePicker } from '@/features/settings/components/theme-picker';
import { useBreadcrumb } from '@/hooks/use-breadcrumb';

import type { VariantProps } from 'class-variance-authority';

type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>;

const VARIANTS: ButtonVariant[] = ['default', 'outline', 'secondary', 'ghost', 'destructive', 'link'];
const SIZES: ButtonSize[] = ['xs', 'sm', 'default', 'lg', 'icon-xs', 'icon-sm', 'icon', 'icon-lg'];

const ICON_SIZES: ButtonSize[] = ['icon-xs', 'icon-sm', 'icon', 'icon-lg'];

export default function SandboxPage() {
  const t = useTranslations();
  useBreadcrumb(t('sidebar.sandbox'));
  const [switchA, setSwitchA] = useState(false);
  const [switchB, setSwitchB] = useState(true);
  const [checkA, setCheckA] = useState(false);
  const [checkB, setCheckB] = useState(true);
  const [bgDefault, setBgDefault] = useState<string>('a');
  const [bgSm, setBgSm] = useState<string>('a');
  const [bgXs, setBgXs] = useState<string>('a');

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">Component playground — not for production.</p>

      {/* ── Theme Picker ── */}
      <SandboxBlock title="Theme — color palette">
        <ThemePicker />
      </SandboxBlock>

      {/* ── Buttons ── */}
      <SandboxBlock title="Button — variant × size">
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-x-3 border-spacing-y-3">
            <thead>
              <tr>
                <th className="text-left text-xs font-semibold text-muted-foreground pr-2 whitespace-nowrap">
                  variant \ size
                </th>
                {SIZES.map(size => (
                  <th key={size} className="text-xs font-semibold text-muted-foreground whitespace-nowrap px-1">
                    {size}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {VARIANTS.map(variant => (
                <tr key={variant}>
                  <td className="text-xs font-semibold text-muted-foreground pr-2 whitespace-nowrap">{variant}</td>
                  {SIZES.map(size => (
                    <td key={size} className="text-center">
                      <Button variant={variant} size={size}>
                        {isIconSize(size) ? <Star /> : 'Button'}
                      </Button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SandboxBlock>

      {/* ── ButtonGroup ── */}
      <SandboxBlock title="ButtonGroup — sizes">
        <div className="space-y-5">
          {[
            { label: 'default', size: 'default' as const, value: bgDefault, onChange: setBgDefault },
            { label: 'sm', size: 'sm' as const, value: bgSm, onChange: setBgSm },
            { label: 'xs', size: 'xs' as const, value: bgXs, onChange: setBgXs },
          ].map(row => (
            <div key={row.label} className="flex items-center gap-4">
              <span className="w-16">
                <StateLabel>{row.label}</StateLabel>
              </span>
              <ButtonGroup
                value={row.value}
                onChange={row.onChange}
                items={[
                  { label: 'Option A', value: 'a' },
                  { label: 'Option B', value: 'b' },
                  { label: 'Option C', value: 'c' },
                ]}
                size={row.size}
              />
            </div>
          ))}
          <div className="flex items-center gap-4">
            <span className="w-16">
              <StateLabel>disabled</StateLabel>
            </span>
            <ButtonGroup
              value="a"
              onChange={() => {}}
              items={[
                { label: 'Option A', value: 'a' },
                { label: 'Option B', value: 'b' },
              ]}
              disabled
            />
          </div>
        </div>
      </SandboxBlock>

      {/* ── Switch ── */}
      <SandboxBlock title="Switch — size × state">
        <div className="flex flex-col gap-5">
          {(['default', 'sm'] as const).map(size => (
            <div key={size} className="space-y-2">
              <StateLabel>{size}</StateLabel>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    size={size}
                    checked={size === 'default' ? switchA : switchB}
                    onCheckedChange={size === 'default' ? setSwitchA : setSwitchB}
                  />
                  <StateLabel>{(size === 'default' ? switchA : switchB) ? 'On' : 'Off'}</StateLabel>
                </div>
                <div className="flex items-center gap-2">
                  <Switch size={size} checked disabled />
                  <StateLabel>Disabled on</StateLabel>
                </div>
                <div className="flex items-center gap-2">
                  <Switch size={size} checked={false} disabled />
                  <StateLabel>Disabled off</StateLabel>
                </div>
              </div>
            </div>
          ))}
        </div>
      </SandboxBlock>

      {/* ── Checkbox ── */}
      <SandboxBlock title="Checkbox — states">
        <div className="flex items-center gap-8">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={checkA} onCheckedChange={v => setCheckA(v === true)} />
            <StateLabel>{checkA ? 'Checked' : 'Unchecked'}</StateLabel>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={checkB} onCheckedChange={v => setCheckB(v === true)} />
            <StateLabel>{checkB ? 'Checked' : 'Unchecked'}</StateLabel>
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked disabled />
            <StateLabel>Disabled checked</StateLabel>
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={false} disabled />
            <StateLabel>Disabled unchecked</StateLabel>
          </label>
        </div>
      </SandboxBlock>

      {/* ── Input ── */}
      <SandboxBlock title="Input — states">
        <div className="grid grid-cols-3 gap-4 max-w-2xl">
          <div className="space-y-1.5">
            <Label>Default</Label>
            <Input placeholder="Type something…" />
          </div>
          <div className="space-y-1.5">
            <Label>With value</Label>
            <Input defaultValue="Hello world" />
          </div>
          <div className="space-y-1.5">
            <Label>Disabled</Label>
            <Input defaultValue="Can't touch this" disabled />
          </div>
          <div className="space-y-1.5">
            <Label>Number</Label>
            <Input type="number" defaultValue={42} min={0} max={100} />
          </div>
          <div className="space-y-1.5">
            <Label>Invalid</Label>
            <Input defaultValue="bad" aria-invalid />
          </div>
          <div className="space-y-1.5">
            <Label>File</Label>
            <Input type="file" />
          </div>
        </div>
      </SandboxBlock>

      {/* ── Textarea ── */}
      <SandboxBlock title="Textarea — states">
        <div className="grid grid-cols-3 gap-4 max-w-2xl">
          <div className="space-y-1.5">
            <Label>Default</Label>
            <Textarea placeholder="Write something…" rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label>Disabled</Label>
            <Textarea defaultValue="Read only content" rows={3} disabled />
          </div>
          <div className="space-y-1.5">
            <Label>Invalid</Label>
            <Textarea defaultValue="Error state" rows={3} aria-invalid />
          </div>
        </div>
      </SandboxBlock>

      {/* ── Card ── */}
      <SandboxBlock title="Card — size × composition">
        <div className="grid grid-cols-2 gap-4 max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle>Default card</CardTitle>
              <CardDescription>With description and action</CardDescription>
              <CardAction>
                <Button variant="ghost" size="icon-sm">
                  <Star />
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Card body content goes here.</p>
            </CardContent>
            <CardFooter>
              <span className="text-xs text-muted-foreground">Footer area</span>
            </CardFooter>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Small card</CardTitle>
              <CardDescription>Compact variant</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Tighter padding and spacing.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Minimal card</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">No description, no footer.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Footer only</CardTitle>
              <CardDescription>Skips content slot</CardDescription>
            </CardHeader>
            <CardFooter>
              <Button size="sm">Action</Button>
            </CardFooter>
          </Card>
        </div>
      </SandboxBlock>

      {/* ── Tooltip ── */}
      <SandboxBlock title="Tooltip — sides">
        <div className="flex items-center gap-8 py-4">
          {(['top', 'bottom', 'left', 'right'] as const).map(side => (
            <Tooltip key={side} content={`Tooltip on ${side}`} side={side}>
              <Button variant="outline" size="sm">
                {side}
              </Button>
            </Tooltip>
          ))}
          <Tooltip content="Default trigger (? icon)" side="top" />
          <Tooltip
            content={
              <span className="flex items-center gap-1.5">
                <Info className="size-3" /> Rich content
              </span>
            }
            side="top"
          >
            <Button variant="outline" size="sm">
              Rich
            </Button>
          </Tooltip>
        </div>
      </SandboxBlock>

      {/* ── ConfirmDialog ── */}
      <SandboxBlock title="ConfirmDialog — variants">
        <div className="flex items-center gap-4">
          <ConfirmDialog
            trigger={
              <Button variant="outline" size="sm">
                Basic confirm
              </Button>
            }
            title="Confirm action"
            description="Are you sure you want to proceed?"
            onConfirm={() => {}}
          />
          <ConfirmDialog
            trigger={
              <Button variant="destructive" size="sm" icon={Trash2}>
                Delete item
              </Button>
            }
            title="Delete this item?"
            description="This action cannot be undone."
            confirmLabel="Delete"
            cancelLabel="Keep"
            confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onConfirm={() => {}}
          />
          <ConfirmDialog
            trigger={
              <Button variant="outline" size="sm">
                With content
              </Button>
            }
            title="Rename item"
            description="Enter a new name below."
            confirmLabel="Rename"
            onConfirm={() => {}}
          >
            <Input placeholder="New name…" />
          </ConfirmDialog>
          <ConfirmDialog
            trigger={
              <Button variant="outline" size="sm">
                Disabled confirm
              </Button>
            }
            title="Cannot proceed"
            description="The confirm button is disabled."
            disableConfirm
            onConfirm={() => {}}
          />
        </div>
      </SandboxBlock>

      {/* ── Label ── */}
      <SandboxBlock title="Label — with form controls">
        <div className="flex items-start gap-8">
          <div className="space-y-1.5">
            <Label htmlFor="label-input">Text input</Label>
            <Input id="label-input" placeholder="Linked via htmlFor" />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="label-check" />
            <Label htmlFor="label-check">Checkbox label</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="label-switch" />
            <Label htmlFor="label-switch">Switch label</Label>
          </div>
        </div>
      </SandboxBlock>

      {/* ── AI Chat Segments ── */}
      <SandboxBlock title="AI Assistant — all segment types & states">
        <AssistChatSandbox />
      </SandboxBlock>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Assistant sandbox — mock turns
// ---------------------------------------------------------------------------

const MOCK_TURNS: AssistTurn[] = [
  // 1. Simple user → assistant text exchange
  {
    id: 'turn-1',
    role: 'user',
    segments: [{ type: 'text', id: 's-1-1', content: 'What tests do I have?', streaming: false }],
  },
  {
    id: 'turn-2',
    role: 'assistant',
    segments: [
      { type: 'tool_indicator', id: 's-2-1', name: 'list_tests', status: 'done' },
      {
        type: 'text',
        id: 's-2-2',
        content: 'You have **3 tests**:\n1. Spanish Vocabulary\n2. European Capitals\n3. Anatomy Basics',
        streaming: false,
      },
    ],
  },
  // 2. Multi-tool turn (parallel reads)
  {
    id: 'turn-3',
    role: 'user',
    segments: [{ type: 'text', id: 's-3-1', content: 'Show me the details of my Spanish test', streaming: false }],
  },
  {
    id: 'turn-4',
    role: 'assistant',
    segments: [
      { type: 'tool_indicator', id: 's-4-1', name: 'get_test_details', status: 'done' },
      {
        type: 'text',
        id: 's-4-2',
        content:
          '**Spanish Vocabulary** has 5 questions:\n1. "to go" → ir, marchar\n2. "house" → casa\n3. "to eat" → comer\n4. "thank you" → gracias\n5. "goodbye" → adiós',
        streaming: false,
      },
    ],
  },
  // 3. Write tool with action card — pending
  {
    id: 'turn-5',
    role: 'user',
    segments: [{ type: 'text', id: 's-5-1', content: 'Remove the question about "goodbye"', streaming: false }],
  },
  {
    id: 'turn-6',
    role: 'assistant',
    segments: [
      { type: 'tool_indicator', id: 's-6-1', name: 'get_test_details', status: 'done' },
      {
        type: 'action_card',
        id: 's-6-2',
        name: 'edit_test',
        arguments: { test_id: 'mock-test-1', remove_question_ids: ['q-5'] },
        context: { questions_to_remove: [{ id: 'q-5', prompt: '"goodbye" → adiós' }] },
        status: 'pending',
      },
    ],
  },
  // 4. Write tool — approved
  {
    id: 'turn-7',
    role: 'assistant',
    segments: [
      {
        type: 'action_card',
        id: 's-7-1',
        name: 'edit_test',
        arguments: { test_id: 'mock-test-2', title: 'European Geography' },
        context: { title_change: { from: 'European Capitals', to: 'European Geography' } },
        status: 'approved',
      },
      {
        type: 'tool_result',
        id: 's-7-1-result',
        name: 'edit_test',
        output: 'Test updated successfully.',
        metadata: { test_id: 'mock-test-2' },
      },
      { type: 'text', id: 's-7-2', content: 'Done! Renamed the test to **European Geography**.', streaming: false },
    ],
  },
  // 5. Write tool — rejected
  {
    id: 'turn-8',
    role: 'assistant',
    segments: [
      {
        type: 'action_card',
        id: 's-8-1',
        name: 'edit_test',
        arguments: { test_id: 'mock-test-3', remove_question_ids: ['q-10', 'q-11'] },
        context: {
          questions_to_remove: [
            { id: 'q-10', prompt: 'What is the mitral valve?' },
            { id: 'q-11', prompt: 'Name the four chambers of the heart' },
          ],
        },
        status: 'rejected',
      },
      {
        type: 'text',
        id: 's-8-2',
        content: "No problem — I won't remove those questions.",
        streaming: false,
      },
    ],
  },
  // 6. Tool indicator states (running, done, failed)
  {
    id: 'turn-9',
    role: 'user',
    segments: [{ type: 'text', id: 's-9-1', content: 'Tool indicator states demo', streaming: false }],
  },
  {
    id: 'turn-10',
    role: 'assistant',
    segments: [
      { type: 'tool_indicator', id: 's-10-1', name: 'list_notes', status: 'running' },
      { type: 'tool_indicator', id: 's-10-2', name: 'get_test_details', status: 'done' },
      { type: 'tool_indicator', id: 's-10-3', name: 'search_questions', status: 'failed' },
    ],
  },
  // 7. Error segment
  {
    id: 'turn-11',
    role: 'assistant',
    segments: [
      {
        type: 'error',
        id: 's-11-1',
        message: 'Something went wrong while processing your request. Please try again.',
      },
    ],
  },
  // 8. Streaming text (simulated)
  {
    id: 'turn-12',
    role: 'assistant',
    segments: [
      { type: 'tool_indicator', id: 's-12-1', name: 'create_note', status: 'done' },
      {
        type: 'text',
        id: 's-12-2',
        content:
          'I created a new note on **Photosynthesis**. It covers the light-dependent reactions and the Calvin cycle...',
        streaming: true,
      },
    ],
  },
  // 9. Text with description change context
  {
    id: 'turn-13',
    role: 'assistant',
    segments: [
      {
        type: 'action_card',
        id: 's-13-1',
        name: 'edit_test',
        arguments: { test_id: 'mock-test-4', description: 'Updated description' },
        context: {
          title_change: { from: 'Old Title', to: 'New Title' },
          description_change: { from: 'Basic vocabulary drills', to: 'Advanced vocabulary with context sentences' },
        },
        status: 'pending',
      },
    ],
  },
];

function AssistChatSandbox() {
  return (
    <div className="mx-auto max-w-md space-y-3 rounded-xl border border-border bg-background p-4">
      {MOCK_TURNS.map(turn => (
        <AssistTurnRow key={turn.id} turn={turn} onConfirm={() => {}} />
      ))}
    </div>
  );
}

function SandboxBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

const isIconSize = (size: ButtonSize) => ICON_SIZES.includes(size);

function StateLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">{children}</span>;
}

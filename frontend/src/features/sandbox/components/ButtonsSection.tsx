'use client';

import { Plus, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button, type buttonVariants } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';

import { SandboxDemo, SandboxSection } from './SandboxSection';

import type { VariantProps } from 'class-variance-authority';

type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>;

const VARIANTS: ButtonVariant[] = ['default', 'outline', 'secondary', 'ghost', 'destructive', 'link'];
const TEXT_SIZES: ButtonSize[] = ['xs', 'sm', 'default', 'lg'];
const ICON_SIZES: ButtonSize[] = ['icon-xs', 'icon-sm', 'icon', 'icon-lg'];
const GROUP_SIZES = ['default', 'sm', 'xs'] as const;
const GROUP_ITEMS = [
  { label: 'Day', value: 'day' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month', disabled: true },
];

export function ButtonsSection() {
  const [groupValue, setGroupValue] = useState('day');

  return (
    <SandboxSection id="buttons" title="Button">
      <SandboxDemo label="Variant and size">
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-2 text-left">
            <tbody>
              {VARIANTS.map(variant => (
                <tr key={variant}>
                  <th scope="row" className="pr-3 text-xs font-medium whitespace-nowrap text-muted-foreground">
                    {variant}
                  </th>
                  {TEXT_SIZES.map(size => (
                    <td key={size}>
                      <Button variant={variant} size={size}>
                        {size}
                      </Button>
                    </td>
                  ))}
                  {ICON_SIZES.map(size => (
                    <td key={size}>
                      <Button variant={variant} size={size} aria-label={`${variant} ${size}`}>
                        <Star />
                      </Button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SandboxDemo>

      <SandboxDemo label="States">
        <div className="flex flex-wrap items-center gap-3">
          <Button icon={Plus}>With icon</Button>
          <Button variant="destructive" icon={Trash2}>
            Delete
          </Button>
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
          <Button variant="outline" tooltip="Shown on hover">
            With tooltip
          </Button>
        </div>
      </SandboxDemo>

      <SandboxDemo label="Button group">
        <div className="space-y-3">
          {GROUP_SIZES.map(size => (
            <ButtonGroup key={size} size={size} value={groupValue} onChange={setGroupValue} items={GROUP_ITEMS} />
          ))}
        </div>
      </SandboxDemo>
    </SandboxSection>
  );
}

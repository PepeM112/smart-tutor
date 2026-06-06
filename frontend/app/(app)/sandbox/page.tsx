'use client';

import { Star } from 'lucide-react';
import { useEffect } from 'react';

import type { buttonVariants } from '@/components/ui/button';
import { Button } from '@/components/ui/button';
import { useBreadcrumbStore } from '@/store/use-breadcrumb-store';

import type { VariantProps } from 'class-variance-authority';

type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>;

const VARIANTS: ButtonVariant[] = ['default', 'outline', 'secondary', 'ghost', 'destructive', 'link'];
const SIZES: ButtonSize[] = ['xs', 'sm', 'default', 'lg', 'icon-xs', 'icon-sm', 'icon', 'icon-lg'];

function SandboxBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl ring-1 ring-foreground/10 bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

const ICON_SIZES: ButtonSize[] = ['icon-xs', 'icon-sm', 'icon', 'icon-lg'];
const isIconSize = (size: ButtonSize) => ICON_SIZES.includes(size);

export default function SandboxPage() {
  const { set, reset } = useBreadcrumbStore();

  useEffect(() => {
    set('Sandbox');
    return () => reset();
  }, [set, reset]);

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">Component playground — not for production.</p>

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
    </div>
  );
}

'use client';

import { Textarea } from '@/components/ui/textarea';
import { useAutoResize } from '@/hooks/use-auto-resize';

export function AutoTextarea(props: React.ComponentProps<typeof Textarea>) {
  const { ref, resize } = useAutoResize();

  return <Textarea ref={ref} onInput={resize} {...props} />;
}

'use client';

import { Textarea } from '@/components/ui/textarea';
import { useAutoResize } from '@/hooks/useAutoResize';

export function AutoTextarea(props: React.ComponentProps<typeof Textarea>) {
  const { ref, resize } = useAutoResize(typeof props.value === 'string' ? props.value : undefined);

  return <Textarea ref={ref} onInput={resize} {...props} />;
}

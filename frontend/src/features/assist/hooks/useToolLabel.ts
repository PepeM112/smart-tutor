import { useTranslations } from 'next-intl';

/** The translated label of a tool (`assist.tools.<name>`). An unknown tool (for example, a new
 * backend tool with no key yet) shows its raw name. */
export function useToolLabel(name: string): string {
  const t = useTranslations('assist.tools');
  return t.has(name) ? t(name) : name;
}

// One icon per callout type. The callout itself and the block handle menu show the same icons.

import { Info, Lightbulb, MessageSquareWarning, OctagonAlert, TriangleAlert, type LucideIcon } from 'lucide-react';

import type { CalloutType } from './calloutTypes';

export const CALLOUT_ICONS: Record<CalloutType, LucideIcon> = {
  note: Info,
  tip: Lightbulb,
  important: MessageSquareWarning,
  warning: TriangleAlert,
  caution: OctagonAlert,
};

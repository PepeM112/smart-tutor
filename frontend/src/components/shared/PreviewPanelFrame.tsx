'use client';

import { X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ReactNode } from 'react';

import { Button } from '@/components/ui/button';

type Props = {
  title: ReactNode;
  /** Target of the Open button. Leave it out while the item loads: the button is then disabled. */
  openHref?: string;
  /** Extra buttons between the title and the Open button (for example a favorite star). */
  headerActions?: ReactNode;
  onClose: () => void;
  /** The body crossfades when this changes (usually the id of the previewed item). */
  contentKey: string;
  children: ReactNode;
};

/**
 * Frame of a read-only preview, rendered in the SplitPane right pane or a mobile Drawer.
 * The header stays fixed; only the body scrolls. The body crossfades (120ms opacity)
 * when `contentKey` changes. No fade on mount: SplitPane already fades the panel in.
 */
export function PreviewPanelFrame({ title, openHref, headerActions, onClose, contentKey, children }: Props) {
  const t = useTranslations();
  const prefersReduced = useReducedMotion();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header — stays put when the item changes; only the body crossfades. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{title}</p>
        {headerActions}
        {/* A real link gives prefetch, middle-click and open in a new tab. */}
        {openHref ? (
          <Button variant="ghost" asChild>
            <Link href={openHref}>{t('common.open')}</Link>
          </Button>
        ) : (
          <Button variant="ghost" disabled>
            {t('common.open')}
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('common.close_preview')}>
          <X className="size-4" />
        </Button>
      </div>

      {/* Body — crossfades when contentKey changes (mode="wait": old fades out, new fades in). */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={contentKey}
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReduced ? 0 : 0.12 }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

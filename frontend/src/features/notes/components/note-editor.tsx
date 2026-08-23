'use client';

import { Eye, Pencil, WandSparkles, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { useAssistAttachmentsStore } from '@/features/assist/store/use-assist-attachments-store';
import { useAssistPanelStore } from '@/features/assist/store/use-assist-panel-store';
import { useAiAvailable } from '@/hooks/use-ai-available';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useResizableSplit } from '@/hooks/use-resizable-split';

import { useNoteAiEdit } from '../hooks/use-note-ai-edit';

import { MarkdownEditor } from './markdown-editor';
import { MarkdownRenderer } from './markdown-renderer';

type Props = {
  content: string;
  onChange: (content: string) => void;
  noteId?: string;
};

const SPLIT_KEY = 'note-editor-split-ratio';
const DEFAULT_RATIO = 0.5;

export function NoteEditor({ content, onChange, noteId }: Props) {
  const t = useTranslations();
  const aiAvailable = useAiAvailable();
  const { isDesktop } = useBreakpoint();
  const viewContainerRef = useRef<HTMLDivElement | null>(null);
  const [viewContainer, setViewContainer] = useState<HTMLDivElement | null>(null);
  const { containerRef, splitRatio, handleDividerMouseDown, resetRatio } = useResizableSplit(SPLIT_KEY, DEFAULT_RATIO);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'view' | 'edit'>('edit');

  const handleViewContainerChange = useCallback((el: HTMLDivElement | null) => {
    viewContainerRef.current = el;
    setViewContainer(el);
  }, []);

  const addAttachment = useAssistAttachmentsStore(s => s.addAttachment);
  const setActiveCommand = useAssistAttachmentsStore(s => s.setActiveCommand);
  const setAssistOpen = useAssistPanelStore(s => s.setOpen);

  const { selectionTrigger, activeDiffIndex, setActiveDiffIndex, activeDiff, removeDiff, handleAcceptDiff } =
    useNoteAiEdit({ content, onChange, noteId, viewContainer, viewContainerRef, isDesktop });

  const handleSendToAssistant = useCallback(() => {
    if (!selectionTrigger || !noteId) return;
    addAttachment({
      type: 'note_chunk',
      label: t('notes_ai.note_text'),
      content: selectionTrigger.markdown,
      metadata: {
        noteId,
        plainText: selectionTrigger.plainText,
        markdownStart: selectionTrigger.markdownStart,
        markdownEnd: selectionTrigger.markdownEnd,
      },
    });
    setActiveCommand('/edit-note');
    setAssistOpen(true);
    window.getSelection()?.removeAllRanges();
  }, [selectionTrigger, noteId, addAttachment, setActiveCommand, setAssistOpen]);

  const hasDiffPanel = activeDiff !== null;

  // ── Diff panel content (shared between desktop side pane and mobile drawer) ──

  const diffPanelContent = activeDiff && (
    <div className="flex h-full flex-col bg-card p-4">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h3 className="text-sm font-semibold text-foreground">{t('notes_ai.changes')}</h3>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setActiveDiffIndex(null)}
          className="text-muted-foreground"
        >
          <X className="size-4" />
        </Button>
      </div>

      <p className="text-xs font-medium text-muted-foreground mb-1.5 shrink-0">{t('notes_ai.old')}</p>
      <div className="rounded-md border border-feedback-wrong-border bg-feedback-wrong-bg p-3 overflow-y-auto scrollbar-none flex-1 min-h-0">
        <MarkdownRenderer content={activeDiff.originalMarkdown} />
      </div>

      <p className="text-xs font-medium text-muted-foreground mb-1.5 mt-3 shrink-0">{t('notes_ai.new')}</p>
      <div className="rounded-md border border-feedback-correct-border bg-feedback-correct-bg p-3 overflow-y-auto scrollbar-none flex-1 min-h-0">
        <MarkdownRenderer content={activeDiff.editedText} />
      </div>

      <div className="flex items-center justify-end gap-2 mt-4 shrink-0">
        <Button variant="outline" size="sm" onClick={() => activeDiffIndex !== null && removeDiff(activeDiffIndex)}>
          {t('common.cancel')}
        </Button>
        <Button size="sm" onClick={handleAcceptDiff}>
          {t('common.accept')}
        </Button>
      </div>
    </div>
  );

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div ref={containerRef} className="flex h-full gap-0">
      {/* Main pane */}
      <div
        className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-card"
        style={{ flex: isDesktop && hasDiffPanel ? splitRatio : 1 }}
      >
        <MarkdownEditor
          content={content}
          onChange={onChange}
          readOnly={!isDesktop}
          onViewContainerChange={handleViewContainerChange}
          onTapView={
            !isDesktop
              ? () => {
                  setDrawerMode('edit');
                  setIsFullscreen(true);
                }
              : undefined
          }
        />
      </div>

      {/* Mobile: fullscreen editor drawer */}
      {!isDesktop && (
        <Drawer open={isFullscreen} onOpenChange={setIsFullscreen}>
          <DrawerContent className="max-h-[95dvh] h-[95dvh]" title="Note editor">
            <div className="flex items-center justify-end px-4 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDrawerMode(m => (m === 'view' ? 'edit' : 'view'))}
                tooltip={drawerMode === 'view' ? t('notes.edit_markdown') : t('notes.preview')}
                className="text-muted-foreground"
              >
                {drawerMode === 'view' ? <Pencil className="size-5" /> : <Eye className="size-5" />}
              </Button>
            </div>
            <div className="flex-1 min-h-0">
              <MarkdownEditor content={content} onChange={onChange} mode={drawerMode} onModeChange={setDrawerMode} />
            </div>
          </DrawerContent>
        </Drawer>
      )}

      {/* Desktop: side-by-side diff panel */}
      {isDesktop && hasDiffPanel && (
        <>
          <div
            className="shrink-0 relative flex items-center justify-center w-5 mx-2 cursor-col-resize"
            onMouseDown={handleDividerMouseDown}
            onDoubleClick={resetRatio}
          >
            <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-border" />
            <div className="relative z-10 w-3 h-7 rounded-full border border-border bg-background" />
          </div>
          <div className="min-w-0 overflow-hidden rounded-lg border border-border" style={{ flex: 1 - splitRatio }}>
            {diffPanelContent}
          </div>
        </>
      )}

      {/* Mobile: diff panel as bottom drawer */}
      {!isDesktop && (
        <Drawer open={hasDiffPanel} onOpenChange={open => !open && setActiveDiffIndex(null)}>
          <DrawerContent className="max-h-[75dvh]">
            <div className="overflow-y-auto px-4 pb-8">{diffPanelContent}</div>
          </DrawerContent>
        </Drawer>
      )}

      {/* Floating AI edit trigger (desktop only) */}
      {isDesktop && selectionTrigger && (
        <div
          style={{
            position: 'fixed',
            top: selectionTrigger.top,
            left: selectionTrigger.left + 6,
            zIndex: 50,
            transform: 'translateY(-50%)',
          }}
        >
          <Button
            size="icon"
            icon={WandSparkles}
            disabled={!aiAvailable}
            tooltip={!aiAvailable ? t('settings.ai_not_configured') : t('notes_ai.edit_with_ai')}
            onClick={handleSendToAssistant}
          />
        </div>
      )}
    </div>
  );
}

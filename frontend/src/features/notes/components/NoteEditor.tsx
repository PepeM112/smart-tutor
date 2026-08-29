'use client';

import { Eye, Pencil, WandSparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { DiffNoteContent, DiffPanel } from '@/features/assist/components/diff';
import { useAssistAttachmentsStore } from '@/features/assist/store/useAssistAttachmentsStore';
import { useAssistPanelStore } from '@/features/assist/store/useAssistPanelStore';
import { useAiAvailable } from '@/hooks/useAiAvailable';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useResizableSplit } from '@/hooks/useResizableSplit';

import { useNoteAiEdit } from '../hooks/useNoteAiEdit';

import { MarkdownEditor } from './MarkdownEditor';

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
  }, [selectionTrigger, noteId, addAttachment, setActiveCommand, setAssistOpen, t]);

  const hasDiffPanel = activeDiff !== null;

  // ── Diff panel content (shared between desktop side pane and mobile drawer) ──

  const diffPanelContent = activeDiff && (
    <DiffPanel
      title={t('notes_ai.changes')}
      onClose={() => setActiveDiffIndex(null)}
      onReject={() => activeDiffIndex !== null && removeDiff(activeDiffIndex)}
      onAccept={handleAcceptDiff}
    >
      <DiffNoteContent oldContent={activeDiff.originalMarkdown} newContent={activeDiff.editedText} />
    </DiffPanel>
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
          <div
            className="min-w-0 overflow-hidden rounded-lg border border-border bg-card"
            style={{ flex: 1 - splitRatio }}
          >
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

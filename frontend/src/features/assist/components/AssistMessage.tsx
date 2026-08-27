'use client';

import { AlertCircle, ArrowRight, Check, CheckCircle, ExternalLink, Eye, Loader2, X } from 'lucide-react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Button } from '@/components/ui/button';
import { Routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

import { useStreamingText } from '../hooks/use-streaming-text';
import { useAssistDiffStore } from '../store/use-assist-diff-store';
import { getToolLabel, isWriteTool } from '../utils/tool-registry';

import type { ConfirmContext, ToolResultMetadata } from '../types';

// ---------------------------------------------------------------------------
// User bubble
// ---------------------------------------------------------------------------

export function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end pl-14">
      <div className="rounded-xl bg-muted px-3 py-1.5 text-[13px] leading-[1.4] text-foreground">{content}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assistant text segment
// ---------------------------------------------------------------------------

export function AssistantBubble({ content, streaming }: { content: string; streaming: boolean }) {
  const displayed = useStreamingText(content, streaming);
  const isRevealing = streaming && displayed.length < content.length;

  if (!content && streaming) {
    return (
      <div className="flex items-center gap-2 py-1">
        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Thinking...</span>
      </div>
    );
  }

  return (
    <div className="max-w-[92%] text-left">
      <div
        className={cn(
          'markdown-body text-[13px] leading-[1.35] text-foreground',
          '[&_p]:my-0.5 [&_ul]:my-0.5 [&_ol]:my-0.5 [&_li]:my-0',
          '[&_ul]:pl-4 [&_ol]:pl-4',
          '[&_strong]:font-semibold',
          '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs',
          '[&_pre]:my-1.5 [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-2.5 [&_pre]:text-xs',
          '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
          '[&_h1]:text-[1.25rem] [&_h1]:font-bold [&_h1]:mt-2 [&_h1]:mb-0.5',
          '[&_h2]:text-[1rem] [&_h2]:font-bold [&_h2]:mt-1.5 [&_h2]:mb-0.5',
          '[&_h3]:text-[0.875rem] [&_h3]:font-semibold [&_h3]:mt-1.5 [&_h3]:mb-0',
          '[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
          '[&_a]:text-primary [&_a]:underline',
          '[&_table]:w-full [&_table]:text-xs [&_table]:my-1.5',
          '[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-0.5 [&_th]:text-left [&_th]:font-medium',
          '[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-0.5'
        )}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayed}</ReactMarkdown>
        {(streaming || isRevealing) && (
          <span className="ml-0.5 inline-block size-1.5 animate-pulse rounded-full bg-foreground/50" />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool indicator (spinner / check / error)
// ---------------------------------------------------------------------------

export function ToolIndicatorRow({ name, status }: { name: string; status: string }) {
  const label = getToolLabel(name);

  return (
    <div className="flex items-center gap-2 py-0.5">
      {status === 'running' ? (
        <Loader2 className="size-3 animate-spin text-muted-foreground" />
      ) : status === 'done' ? (
        <CheckCircle className="size-3 text-feedback-correct" />
      ) : (
        <AlertCircle className="size-3 text-destructive" />
      )}
      <span className="text-[12px] text-muted-foreground">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool result
// ---------------------------------------------------------------------------

export function ToolResultRow({
  name,
  output,
  metadata,
}: {
  name: string;
  output: string;
  metadata?: ToolResultMetadata;
}) {
  if (name === 'navigate_to') return null;

  if (name === 'refine_note' && metadata?.note_id && metadata.old_content != null) {
    return <RefineNoteResult noteId={metadata.note_id} />;
  }

  if (name === 'refine_questions' && metadata?.test_id && metadata.questions) {
    return <RefineQuestionsResult testId={metadata.test_id} />;
  }

  if (!isWriteTool(name)) return null;

  const resourceId = metadata?.test_id ?? metadata?.note_id;
  const viewPath = resourceId
    ? name === 'create_test' || name === 'edit_test'
      ? Routes.TEST_EDIT(resourceId)
      : name === 'create_note'
        ? Routes.NOTE_DETAIL(resourceId)
        : null
    : null;

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-2.5">
      <p className="text-[12px] leading-[1.4] text-muted-foreground whitespace-pre-wrap">{output}</p>
      {viewPath && (
        <div className="mt-2 flex items-center gap-3">
          <Link
            href={viewPath}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
          >
            View <ExternalLink className="size-3" />
          </Link>
        </div>
      )}
    </div>
  );
}

function RefineNoteResult({ noteId }: { noteId: string }) {
  const pendingDiff = useAssistDiffStore(s => s.pendingNoteDiff);
  const hasDiff = pendingDiff?.noteId === noteId;

  return (
    <div className="flex items-center gap-2 py-0.5">
      <CheckCircle className="size-3 text-feedback-correct" />
      <span className="text-[12px] text-muted-foreground">
        {hasDiff ? 'Refinement ready — review the changes before applying.' : 'Refinement applied.'}
      </span>
      {hasDiff && (
        <Link
          href={`${Routes.NOTE_DETAIL(noteId)}?diff=assist`}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
        >
          View changes <Eye className="size-3" />
        </Link>
      )}
    </div>
  );
}

function RefineQuestionsResult({ testId }: { testId: string }) {
  const pendingDiff = useAssistDiffStore(s => s.pendingTestDiff);
  const hasDiff = pendingDiff?.testId === testId;

  return (
    <div className="flex items-center gap-2 py-0.5">
      <CheckCircle className="size-3 text-feedback-correct" />
      <span className="text-[12px] text-muted-foreground">
        {hasDiff ? 'Question refinement ready — review the changes before applying.' : 'Refinement applied.'}
      </span>
      {hasDiff && (
        <Link
          href={`${Routes.TEST_EDIT(testId)}?diff=assist`}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
        >
          View changes <Eye className="size-3" />
        </Link>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Action card (approve / reject)
// ---------------------------------------------------------------------------

export function ActionCard({
  id,
  name,
  arguments: args,
  context,
  status,
  onConfirm,
}: {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  context?: ConfirmContext;
  status: 'pending' | 'approved' | 'rejected';
  onConfirm: (id: string, approved: boolean) => void;
}) {
  const label = getToolLabel(name);
  const summary = _summarizeArgs(name, args);
  const questionsToRemove = context?.questions_to_remove;
  const titleChange = context?.title_change;
  const descChange = context?.description_change;
  const hasContextDetails = questionsToRemove || titleChange || descChange;

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="flex size-5 items-center justify-center rounded-md bg-primary/10 text-primary">
          <AlertCircle className="size-3" />
        </span>
        <span className="text-[12px] font-medium text-foreground">{label}</span>
      </div>
      {summary && !hasContextDetails && <p className="mb-2 text-[12px] text-muted-foreground">{summary}</p>}

      {titleChange && (
        <div className="mb-2 space-y-0.5">
          <p className="text-[12px] font-medium text-muted-foreground">Title:</p>
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="rounded border border-destructive/20 bg-destructive/5 px-1.5 py-0.5 text-foreground line-through">
              {titleChange.from}
            </span>
            <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
            <span className="rounded border border-feedback-correct-border bg-feedback-correct-bg px-1.5 py-0.5 text-foreground">
              {titleChange.to}
            </span>
          </div>
        </div>
      )}

      {descChange && (
        <div className="mb-2 space-y-0.5">
          <p className="text-[12px] font-medium text-muted-foreground">Description:</p>
          <div className="space-y-0.5 text-[11px]">
            <div className="rounded border border-destructive/20 bg-destructive/5 px-1.5 py-0.5 text-foreground line-through">
              {descChange.from || '(empty)'}
            </div>
            <div className="rounded border border-feedback-correct-border bg-feedback-correct-bg px-1.5 py-0.5 text-foreground">
              {descChange.to}
            </div>
          </div>
        </div>
      )}

      {questionsToRemove && questionsToRemove.length > 0 && (
        <div className="mb-2 space-y-1">
          <p className="text-[12px] font-medium text-muted-foreground">
            {questionsToRemove.length === 1 ? 'Question to remove:' : 'Questions to remove:'}
          </p>
          {questionsToRemove.map(q => (
            <div
              key={q.id}
              className="rounded-lg border border-destructive/20 bg-destructive/5 px-2 py-1.5 text-[11px] leading-[1.4] text-foreground"
            >
              {q.prompt}
            </div>
          ))}
        </div>
      )}

      {status === 'pending' && (
        <div className="flex gap-2">
          <Button variant="default" size="sm" className="flex-1" onClick={() => onConfirm(id, true)}>
            <Check className="size-3" />
            Approve
          </Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={() => onConfirm(id, false)}>
            <X className="size-3" />
            Reject
          </Button>
        </div>
      )}
      {status === 'approved' && (
        <div className="flex items-center gap-1.5 text-[12px] text-feedback-correct">
          <CheckCircle className="size-3" />
          Approved — executing...
        </div>
      )}
      {status === 'rejected' && (
        <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <X className="size-3" />
          Rejected
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export function ErrorRow({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-2.5">
      <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
      <p className="text-[12px] text-destructive">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _argStr(value: unknown, fallback = 'Unknown'): string {
  return typeof value === 'string' ? value : fallback;
}

function _summarizeArgs(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'create_note':
      return `Topic: ${_argStr(args.topic)}${args.length ? ` (${_argStr(args.length)})` : ''}`;
    case 'create_test': {
      const count = typeof args.question_count === 'number' ? args.question_count : 10;
      const difficulty = _argStr(args.difficulty as string, 'medium');
      return `${count} questions, ${difficulty} difficulty`;
    }
    case 'edit_test': {
      const parts: string[] = [];
      if (args.title) parts.push(`Rename to "${_argStr(args.title)}"`);
      if (args.description) parts.push('Update description');
      if (Array.isArray(args.remove_question_ids)) parts.push(`Remove ${args.remove_question_ids.length} question(s)`);
      return parts.join(', ') || 'No changes';
    }
    default:
      return JSON.stringify(args);
  }
}

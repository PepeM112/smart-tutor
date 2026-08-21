'use client';

import { AlertCircle, Check, CheckCircle, ExternalLink, Loader2, X } from 'lucide-react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '@/lib/utils';

import { TOOL_LABELS, WRITE_TOOLS, type ChatMessage } from '../types';

type AssistMessageRowProps = {
  message: ChatMessage;
  onConfirm: (toolCallId: string, approved: boolean) => void;
};

export function AssistMessageRow({ message, onConfirm }: AssistMessageRowProps) {
  switch (message.type) {
    case 'user':
      return <UserBubble content={message.content} />;
    case 'assistant':
      return <AssistantBubble content={message.content} streaming={message.streaming} />;
    case 'tool_call':
      return <ToolCallRow name={message.name} status={message.status} />;
    case 'tool_result':
      return <ToolResultRow name={message.name} output={message.output} />;
    case 'confirm_required':
      return (
        <ConfirmCard
          id={message.id}
          name={message.name}
          arguments={message.arguments}
          status={message.status}
          onConfirm={onConfirm}
        />
      );
    case 'error':
      return <ErrorRow message={message.message} />;
    default:
      return null;
  }
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end pl-14">
      <div className="rounded-xl bg-muted px-3 py-1.5 text-[13px] leading-[1.4] text-foreground">{content}</div>
    </div>
  );
}

function AssistantBubble({ content, streaming }: { content: string; streaming: boolean }) {
  if (!content && streaming) {
    return (
      <div className="flex items-center gap-2 py-1">
        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Thinking...</span>
      </div>
    );
  }

  return (
    <div className="max-w-[92%]">
      <div
        className={cn(
          'markdown-body text-[13px] leading-[1.35] text-foreground',
          '[&_p]:my-0.5 [&_ul]:my-0.5 [&_ol]:my-0.5 [&_li]:my-0',
          '[&_ul]:pl-4 [&_ol]:pl-4',
          '[&_strong]:font-semibold',
          '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs',
          '[&_pre]:my-1.5 [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-2.5 [&_pre]:text-xs',
          '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
          '[&_h1]:text-sm [&_h1]:font-bold [&_h1]:mt-2 [&_h1]:mb-0.5',
          '[&_h2]:text-[13px] [&_h2]:font-bold [&_h2]:mt-1.5 [&_h2]:mb-0.5',
          '[&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:mt-1.5 [&_h3]:mb-0',
          '[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
          '[&_a]:text-primary [&_a]:underline',
          '[&_table]:w-full [&_table]:text-xs [&_table]:my-1.5',
          '[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-0.5 [&_th]:text-left [&_th]:font-medium',
          '[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-0.5'
        )}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        {streaming && <span className="ml-0.5 inline-block size-1.5 animate-pulse rounded-full bg-foreground/50" />}
      </div>
    </div>
  );
}

function ToolCallRow({ name, status }: { name: string; status: string }) {
  const label = TOOL_LABELS[name] ?? name;

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

function ToolResultRow({ name, output }: { name: string; output: string }) {
  if (output.startsWith('__NAVIGATE__:')) return null;
  if (!WRITE_TOOLS.has(name)) return null;

  const idMatch = output.match(/\*\*ID:\*\* `([^`]+)`/);
  const resourceId = idMatch?.[1];
  const viewPath =
    name === 'create_note' || name === 'refine_note' ? (resourceId ? `/notes/${resourceId}` : null) : null;

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-2.5">
      <p className="text-[12px] leading-[1.4] text-muted-foreground whitespace-pre-wrap">{output}</p>
      {viewPath && (
        <Link
          href={viewPath}
          className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
        >
          View <ExternalLink className="size-3" />
        </Link>
      )}
    </div>
  );
}

function ConfirmCard({
  id,
  name,
  arguments: args,
  status,
  onConfirm,
}: {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected';
  onConfirm: (id: string, approved: boolean) => void;
}) {
  const label = TOOL_LABELS[name] ?? name;
  const summary = _summarizeArgs(name, args);

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="flex size-5 items-center justify-center rounded-md bg-primary/10 text-primary">
          <AlertCircle className="size-3" />
        </span>
        <span className="text-[12px] font-medium text-foreground">{label}</span>
      </div>
      {summary && <p className="mb-2 text-[12px] text-muted-foreground">{summary}</p>}

      {status === 'pending' && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onConfirm(id, true)}
            className="flex h-7 items-center gap-1 rounded-lg bg-primary px-3 text-[12px] font-medium text-primary-foreground transition-[background-color,transform] duration-200 hover:bg-primary/90 active:scale-[0.97]"
          >
            <Check className="size-3" />
            Approve
          </button>
          <button
            type="button"
            onClick={() => onConfirm(id, false)}
            className="flex h-7 items-center gap-1 rounded-lg border border-border bg-background px-3 text-[12px] font-medium text-muted-foreground transition-[background-color,color,transform] duration-200 hover:bg-muted hover:text-foreground active:scale-[0.97]"
          >
            <X className="size-3" />
            Reject
          </button>
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

function ErrorRow({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-2.5">
      <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
      <p className="text-[12px] text-destructive">{message}</p>
    </div>
  );
}

function _argStr(value: unknown, fallback = 'Unknown'): string {
  return typeof value === 'string' ? value : fallback;
}

function _summarizeArgs(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'create_note':
      return `Topic: ${_argStr(args.topic)}${args.length ? ` (${_argStr(args.length)})` : ''}`;
    case 'refine_note':
      return `Instructions: ${_argStr(args.instructions)}`;
    default:
      return JSON.stringify(args);
  }
}

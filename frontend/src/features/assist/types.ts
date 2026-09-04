import type { GeneratedQuestionPreviewOutput } from '@/client';

export type {
  AssistMessage,
  AssistRequest,
  GeneratedQuestionPreviewOutput,
  PageContext,
  ToolCallData,
  ToolConfirmation,
  ToolResultData,
} from '@/client';

// ---------------------------------------------------------------------------
// SSE events emitted by the backend
// ---------------------------------------------------------------------------

export type SSETextDelta = { content: string };
export type SSEToolCall = { id: string; name: string; arguments: Record<string, unknown> };
export type SSEToolResult = {
  id: string;
  name: string;
  output: string;
  metadata?: ToolResultMetadata;
};
export type SSEToolExecuting = { id: string; name: string };
export type ConfirmContext = {
  questions_to_remove?: { id: string; prompt: string }[];
  title_change?: { from: string; to: string };
  description_change?: { from: string; to: string };
};
export type SSEConfirmRequired = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  context?: ConfirmContext;
};
export type SSEDone = {
  usage: { input_tokens: number; output_tokens: number };
  pending_confirmations?: string[];
};
export type SSEError = { message: string };

export type ToolResultMetadata = {
  route?: string;
  removedQuestionIds?: string[];
  testId?: string;
  noteId?: string;
  oldContent?: string;
  newContent?: string;
  questions?: GeneratedQuestionPreviewOutput[];
  selectedIndices?: number[];
};

// ---------------------------------------------------------------------------
// Turn-based display model
// ---------------------------------------------------------------------------

export type TextSegment = {
  type: 'text';
  id: string;
  content: string;
  displayContent?: string;
  streaming: boolean;
};

export type ToolIndicatorSegment = {
  type: 'tool_indicator';
  id: string;
  name: string;
  status: 'running' | 'done' | 'failed' | 'stopped';
};

export type ToolResultSegment = {
  type: 'tool_result';
  id: string;
  name: string;
  output: string;
  metadata?: ToolResultMetadata;
};

export type ActionCardSegment = {
  type: 'action_card';
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  context?: ConfirmContext;
  status: 'pending' | 'approved' | 'rejected';
};

export type ErrorSegment = {
  type: 'error';
  id: string;
  message: string;
};

export type StoppedSegment = {
  type: 'stopped';
  id: string;
};

export type TurnSegment =
  | TextSegment
  | ToolIndicatorSegment
  | ToolResultSegment
  | ActionCardSegment
  | ErrorSegment
  | StoppedSegment;

export type AssistTurn = {
  id: string;
  role: 'user' | 'assistant';
  segments: TurnSegment[];
};

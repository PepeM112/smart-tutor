export type PageContext = {
  route: string;
  resourceType?: string;
  resourceId?: string;
};

export type ToolCallData = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type ToolResultData = {
  toolCallId: string;
  output: unknown;
};

export type AssistMessage = {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCallData[];
  toolResults?: ToolResultData[];
};

export type ToolConfirmation = {
  toolCallId: string;
  approved: boolean;
};

export type AssistRequest = {
  messages: AssistMessage[];
  pageContext?: PageContext;
  toolConfirmations?: ToolConfirmation[];
};

// SSE events emitted by the backend
export type SSETextDelta = { content: string };
export type SSEToolCall = { id: string; name: string; arguments: Record<string, unknown> };
export type SSEToolResult = { id: string; name: string; output: string };
export type SSEToolExecuting = { id: string; name: string };
export type SSEConfirmRequired = { id: string; name: string; arguments: Record<string, unknown> };
export type SSEDone = {
  usage: { input_tokens: number; output_tokens: number };
  pending_confirmations?: string[];
};
export type SSEError = { message: string };

// UI-level message for rendering
export type ChatMessage =
  | { type: 'user'; content: string }
  | { type: 'assistant'; content: string; streaming: boolean }
  | {
      type: 'tool_call';
      id: string;
      name: string;
      arguments: Record<string, unknown>;
      status: 'running' | 'done' | 'failed';
    }
  | { type: 'tool_result'; id: string; name: string; output: string }
  | {
      type: 'confirm_required';
      id: string;
      name: string;
      arguments: Record<string, unknown>;
      status: 'pending' | 'approved' | 'rejected';
    }
  | { type: 'error'; message: string };

export const WRITE_TOOLS = new Set(['create_note', 'refine_note']);

export const TOOL_LABELS: Record<string, string> = {
  list_notes: 'Listing notes',
  list_tests: 'Listing tests',
  get_note_content: 'Reading note',
  get_test_details: 'Reading test',
  search_questions: 'Searching questions',
  navigate_to: 'Navigating',
  create_note: 'Creating note',
  refine_note: 'Refining note',
};

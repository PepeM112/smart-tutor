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
  removed_question_ids?: string[];
  test_id?: string;
  note_id?: string;
  old_content?: string;
  new_content?: string;
};

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
  | { type: 'tool_result'; id: string; name: string; output: string; metadata?: ToolResultMetadata }
  | {
      type: 'confirm_required';
      id: string;
      name: string;
      arguments: Record<string, unknown>;
      context?: ConfirmContext;
      status: 'pending' | 'approved' | 'rejected';
    }
  | { type: 'error'; message: string };

export const WRITE_TOOLS = new Set(['create_note', 'refine_note', 'create_test', 'edit_test']);

export const TOOL_LABELS: Record<string, string> = {
  list_notes: 'Listing notes',
  list_tests: 'Listing tests',
  get_note_content: 'Reading note',
  get_test_details: 'Reading test',
  search_questions: 'Searching questions',
  navigate_to: 'Navigating',
  create_note: 'Creating note',
  refine_note: 'Refining note',
  create_test: 'Creating test',
  edit_test: 'Editing test',
};

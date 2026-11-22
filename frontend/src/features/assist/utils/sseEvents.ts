import { isRecord } from '@/lib/typeGuards';

import type {
  SSEConfirmRequired,
  SSEError,
  SSERoundEnd,
  SSETextDelta,
  SSEToolCall,
  SSEToolExecuting,
  SSEToolResult,
} from '../types';

export type SSEEvent =
  | { event: 'text_delta'; data: SSETextDelta }
  | { event: 'tool_call'; data: SSEToolCall }
  | { event: 'tool_executing'; data: SSEToolExecuting }
  | { event: 'tool_result'; data: SSEToolResult }
  | { event: 'confirm_required'; data: SSEConfirmRequired }
  | { event: 'round_end'; data: SSERoundEnd }
  | { event: 'done' }
  | { event: 'error'; data: SSEError };

// Only the fields that the handler reads are checked: the rest goes on unchanged, as it came from the backend.
function isTextDelta(data: unknown): data is SSETextDelta {
  return isRecord(data) && typeof data.content === 'string';
}

function isToolCall(data: unknown): data is SSEToolCall {
  return isRecord(data) && typeof data.id === 'string' && typeof data.name === 'string' && isRecord(data.arguments);
}

function isToolExecuting(data: unknown): data is SSEToolExecuting {
  return isRecord(data) && typeof data.id === 'string' && typeof data.name === 'string';
}

function isToolResult(data: unknown): data is SSEToolResult {
  return (
    isRecord(data) && typeof data.id === 'string' && typeof data.name === 'string' && typeof data.output === 'string'
  );
}

function isConfirmRequired(data: unknown): data is SSEConfirmRequired {
  return isToolCall(data);
}

// The thinking blocks are opaque: they go back unchanged in the message of the round.
function isRoundEnd(data: unknown): data is SSERoundEnd {
  return isRecord(data) && (data.thinking_blocks === undefined || Array.isArray(data.thinking_blocks));
}

function isSSEError(data: unknown): data is SSEError {
  return isRecord(data) && typeof data.message === 'string';
}

/** Types one parsed SSE event by its name. `undefined` for an unknown event or a data shape that the handler cannot read. */
export function parseSSEEvent(event: string, data: unknown): SSEEvent | undefined {
  switch (event) {
    case 'text_delta':
      return isTextDelta(data) ? { event, data } : undefined;
    case 'tool_call':
      return isToolCall(data) ? { event, data } : undefined;
    case 'tool_executing':
      return isToolExecuting(data) ? { event, data } : undefined;
    case 'tool_result':
      return isToolResult(data) ? { event, data } : undefined;
    case 'confirm_required':
      return isConfirmRequired(data) ? { event, data } : undefined;
    case 'round_end':
      return isRoundEnd(data) ? { event, data } : undefined;
    case 'done':
      return { event };
    case 'error':
      return isSSEError(data) ? { event, data } : undefined;
    default:
      return undefined;
  }
}

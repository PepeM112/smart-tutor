import type { AssistMessage, ToolCallData, ToolConfirmation, ToolResultData } from '../types';

export const DECLINED_OUTPUT = 'User declined this action.';
export const INTERRUPTED_OUTPUT = 'The action did not finish.';

type StreamOutcome = {
  text: string;
  toolCalls: ToolCallData[];
  toolResults: ToolResultData[];
  /** Decisions sent with the request that started this stream (a resumed stream after approval). */
  confirmations?: ToolConfirmation[];
};

/**
 * Results for the tool calls the user decided on in the previous turn. They belong to the
 * assistant message of that previous turn, so they must come right after it.
 */
function confirmationResults(
  confirmations: ToolConfirmation[],
  toolResults: ToolResultData[],
  fallbackOutput: string
): ToolResultData[] {
  return confirmations.map(({ toolCallId, approved }) => ({
    toolCallId,
    output: approved ? (toolResults.find(r => r.toolCallId === toolCallId)?.output ?? fallbackOutput) : DECLINED_OUTPUT,
  }));
}

/**
 * Conversation messages to store after a stream ends with `done`.
 *
 * Both providers need the result of a tool call in the message right after the assistant
 * message that holds the call. A resumed stream receives the result of the approved tool
 * (and the decline text of the others) first, so those go BEFORE the new assistant message.
 * The results of the tool calls of this stream (read tools) go after it.
 */
export function buildStreamMessages({
  text,
  toolCalls,
  toolResults,
  confirmations = [],
}: StreamOutcome): AssistMessage[] {
  const decidedIds = new Set(confirmations.map(c => c.toolCallId));
  const ownResults = toolResults.filter(r => !decidedIds.has(r.toolCallId));
  const decided = confirmationResults(confirmations, toolResults, INTERRUPTED_OUTPUT);

  const messages: AssistMessage[] = [];
  if (decided.length > 0) messages.push({ role: 'tool', content: '', toolResults: decided });
  // An empty assistant message (a stream that only failed) would be rejected by the provider.
  if (text || toolCalls.length > 0) {
    messages.push({ role: 'assistant', content: text, toolCalls: toolCalls.length > 0 ? toolCalls : undefined });
  }
  if (ownResults.length > 0) messages.push({ role: 'tool', content: '', toolResults: ownResults });
  return messages;
}

/**
 * Messages to store when a resumed stream stops without `done` (abort, network error).
 * The new assistant message is lost, but the tool calls of the previous turn still need a
 * result, or the next request is rejected. Nothing else from the broken stream is kept.
 */
export function buildInterruptedMessages(
  confirmations: ToolConfirmation[],
  toolResults: ToolResultData[]
): AssistMessage[] {
  if (confirmations.length === 0) return [];
  return [
    { role: 'tool', content: '', toolResults: confirmationResults(confirmations, toolResults, INTERRUPTED_OUTPUT) },
  ];
}

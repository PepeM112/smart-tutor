import type { AssistMessage, ThinkingBlockData, ToolCallData, ToolConfirmation, ToolResultData } from '../types';

export const DECLINED_OUTPUT = 'User declined this action.';
export const INTERRUPTED_OUTPUT = 'The action did not finish.';

/** One model response of a stream: its text, its tool calls and its thinking blocks. */
export type StreamRound = {
  text: string;
  toolCalls: ToolCallData[];
  /** As the provider sent them. Kept on the assistant message of this round. */
  thinkingBlocks?: ThinkingBlockData[];
};

type StreamOutcome = {
  rounds: StreamRound[];
  /** The results of the whole stream: the read tools of every round and the approved tools of the previous turn. */
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
 * The history must match what the model saw: one assistant message per round, each followed by
 * the results of its own tool calls. Haiku 5.5 checks the thinking signatures against that
 * conversation. Both providers need the result of a tool call in the message right after the
 * assistant message that holds the call. A resumed stream receives the result of the approved
 * tool (and the decline text of the others) first, so those go BEFORE the first new assistant
 * message. The results of the read tools of a round go right after that round.
 */
export function buildStreamMessages({ rounds, toolResults, confirmations = [] }: StreamOutcome): AssistMessage[] {
  const decided = confirmationResults(confirmations, toolResults, INTERRUPTED_OUTPUT);

  const roundMessages = rounds
    // An empty assistant message (a stream that only failed) would be rejected by the provider.
    .filter(({ text, toolCalls }) => text || toolCalls.length > 0)
    .flatMap(({ text, toolCalls, thinkingBlocks }): AssistMessage[] => {
      const ownResults = toolResults.filter(r => toolCalls.some(tc => tc.id === r.toolCallId));
      return [
        {
          role: 'assistant',
          content: text,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          ...(thinkingBlocks?.length && { thinkingBlocks }),
        },
        ...(ownResults.length > 0 ? [{ role: 'tool' as const, content: '', toolResults: ownResults }] : []),
      ];
    });

  return [
    ...(decided.length > 0 ? [{ role: 'tool' as const, content: '', toolResults: decided }] : []),
    ...roundMessages,
  ];
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

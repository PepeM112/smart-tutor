import { describe, expect, it } from 'vitest';

import {
  buildInterruptedMessages,
  buildStreamMessages,
  DECLINED_OUTPUT,
  INTERRUPTED_OUTPUT,
} from './buildStreamMessages';

import type { AssistMessage, ToolCallData } from '../types';

const call = (id: string, name: string): ToolCallData => ({ id, name, arguments: {} });

/** Every tool call must have its result in the tool message(s) right after its assistant message. */
function assertValidHistory(messages: AssistMessage[], pendingIds: string[] = []): void {
  messages.forEach((msg, index) => {
    if (msg.role !== 'assistant' || !msg.toolCalls) return;
    const following: string[] = [];
    for (let i = index + 1; i < messages.length && messages[i].role === 'tool'; i++) {
      messages[i].toolResults?.forEach(r => following.push(r.toolCallId));
    }
    msg.toolCalls.forEach(tc => {
      if (!pendingIds.includes(tc.id)) expect(following).toContain(tc.id);
    });
  });
}

describe('buildStreamMessages', () => {
  it('stores the assistant message and then the results of its own tool calls', () => {
    const messages = buildStreamMessages({
      text: 'Found it.',
      toolCalls: [call('r1', 'list_notes'), call('r2', 'list_folders')],
      toolResults: [
        { toolCallId: 'r1', output: 'notes' },
        { toolCallId: 'r2', output: 'folders' },
      ],
    });

    expect(messages.map(m => m.role)).toEqual(['assistant', 'tool']);
    expect(messages[1].toolResults).toHaveLength(2);
    assertValidHistory(messages);
  });

  it('stores only an assistant message when there are no tool calls', () => {
    const messages = buildStreamMessages({ text: 'Hi', toolCalls: [], toolResults: [] });
    expect(messages).toEqual([{ role: 'assistant', content: 'Hi', toolCalls: undefined }]);
  });

  it('stores nothing for an empty stream', () => {
    expect(buildStreamMessages({ text: '', toolCalls: [], toolResults: [] })).toEqual([]);
  });

  it('puts the result of the approved tool BEFORE the new assistant message (create_folder, then move_items)', () => {
    // History before the resumed stream: assistant[create_folder] with no result yet.
    const history: AssistMessage[] = [
      { role: 'user', content: 'Move my notes to a new folder' },
      { role: 'assistant', content: '', toolCalls: [call('cf', 'create_folder')] },
    ];

    const messages = buildStreamMessages({
      text: 'Now I move them.',
      toolCalls: [call('mv', 'move_items')],
      toolResults: [{ toolCallId: 'cf', output: 'Created folder' }],
      confirmations: [{ toolCallId: 'cf', approved: true }],
    });

    expect(messages.map(m => m.role)).toEqual(['tool', 'assistant']);
    expect(messages[0].toolResults).toEqual([{ toolCallId: 'cf', output: 'Created folder' }]);
    // move_items is pending: its result comes with the next confirmation.
    assertValidHistory([...history, ...messages], ['mv']);
  });

  it('keeps own read results after the new assistant message in a resumed stream', () => {
    const messages = buildStreamMessages({
      text: '',
      toolCalls: [call('r1', 'list_folders')],
      toolResults: [
        { toolCallId: 'cf', output: 'Created folder' },
        { toolCallId: 'r1', output: 'folders' },
      ],
      confirmations: [{ toolCallId: 'cf', approved: true }],
    });

    expect(messages.map(m => m.role)).toEqual(['tool', 'assistant', 'tool']);
    expect(messages[0].toolResults?.map(r => r.toolCallId)).toEqual(['cf']);
    expect(messages[2].toolResults?.map(r => r.toolCallId)).toEqual(['r1']);
  });

  it('records a decline for the other pending tool calls sent with the request', () => {
    const messages = buildStreamMessages({
      text: 'Done.',
      toolCalls: [],
      toolResults: [{ toolCallId: 'a', output: 'ok' }],
      confirmations: [
        { toolCallId: 'a', approved: true },
        { toolCallId: 'b', approved: false },
      ],
    });

    expect(messages[0].toolResults).toEqual([
      { toolCallId: 'a', output: 'ok' },
      { toolCallId: 'b', output: DECLINED_OUTPUT },
    ]);
  });

  it('keeps the confirmation results even when the resumed stream has no assistant output', () => {
    const messages = buildStreamMessages({
      text: '',
      toolCalls: [],
      toolResults: [{ toolCallId: 'cf', output: 'Created folder' }],
      confirmations: [{ toolCallId: 'cf', approved: true }],
    });
    expect(messages.map(m => m.role)).toEqual(['tool']);
  });
});

describe('buildInterruptedMessages', () => {
  it('keeps the invariant when a resumed stream stops before done', () => {
    const messages = buildInterruptedMessages(
      [
        { toolCallId: 'a', approved: true },
        { toolCallId: 'b', approved: false },
      ],
      []
    );
    expect(messages).toEqual([
      {
        role: 'tool',
        content: '',
        toolResults: [
          { toolCallId: 'a', output: INTERRUPTED_OUTPUT },
          { toolCallId: 'b', output: DECLINED_OUTPUT },
        ],
      },
    ]);
  });

  it('uses the real result when the approved tool finished before the stop', () => {
    const messages = buildInterruptedMessages(
      [{ toolCallId: 'a', approved: true }],
      [{ toolCallId: 'a', output: 'ok' }]
    );
    expect(messages[0].toolResults).toEqual([{ toolCallId: 'a', output: 'ok' }]);
  });

  it('stores nothing for a stream that was not a resume', () => {
    expect(buildInterruptedMessages([], [{ toolCallId: 'x', output: 'y' }])).toEqual([]);
  });
});

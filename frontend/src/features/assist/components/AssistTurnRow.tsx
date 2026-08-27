'use client';

import { ActionCard, AssistantBubble, ErrorRow, ToolIndicatorRow, ToolResultRow, UserBubble } from './AssistMessage';

import type { AssistTurn, TextSegment, TurnSegment } from '../types';

type AssistTurnRowProps = {
  turn: AssistTurn;
  onConfirm: (toolCallId: string, approved: boolean) => void;
};

type RenderSegment = TurnSegment | { type: 'merged_text'; id: string; content: string; streaming: boolean };

export function AssistTurnRow({ turn, onConfirm }: AssistTurnRowProps) {
  if (turn.role === 'user') {
    const seg = turn.segments[0];
    if (seg?.type === 'text') {
      return <UserBubble content={seg.displayContent ?? seg.content} />;
    }
    return null;
  }

  if (turn.segments.length === 0) return null;

  const rendered = mergeConsecutiveText(turn.segments);

  return (
    <div className="space-y-1">
      {rendered.map(segment => (
        <SegmentView key={`${segment.type}-${segment.id}`} segment={segment} onConfirm={onConfirm} />
      ))}
    </div>
  );
}

function SegmentView({
  segment,
  onConfirm,
}: {
  segment: RenderSegment;
  onConfirm: (toolCallId: string, approved: boolean) => void;
}) {
  switch (segment.type) {
    case 'text':
    case 'merged_text':
      return <AssistantBubble content={segment.content} streaming={segment.streaming} />;
    case 'tool_indicator':
      return <ToolIndicatorRow name={segment.name} status={segment.status} />;
    case 'tool_result':
      return <ToolResultRow name={segment.name} output={segment.output} metadata={segment.metadata} />;
    case 'action_card':
      return (
        <ActionCard
          id={segment.id}
          name={segment.name}
          arguments={segment.arguments}
          context={segment.context}
          status={segment.status}
          onConfirm={onConfirm}
        />
      );
    case 'error':
      return <ErrorRow message={segment.message} />;
    default:
      return null;
  }
}

function mergeConsecutiveText(segments: TurnSegment[]): RenderSegment[] {
  const result: RenderSegment[] = [];
  let textBuffer: TextSegment[] = [];

  const flushText = () => {
    if (textBuffer.length === 0) return;
    if (textBuffer.length === 1) {
      result.push(textBuffer[0]);
    } else {
      result.push({
        type: 'merged_text',
        id: textBuffer[0].id,
        content: textBuffer.map(s => s.content).join(''),
        streaming: textBuffer[textBuffer.length - 1].streaming,
      });
    }
    textBuffer = [];
  };

  segments.forEach(seg => {
    if (seg.type === 'text') {
      textBuffer.push(seg);
    } else {
      flushText();
      result.push(seg);
    }
  });
  flushText();
  return result;
}

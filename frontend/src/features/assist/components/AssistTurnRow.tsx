'use client';

import {
  ActionCard,
  AssistantBubble,
  ErrorRow,
  StoppedRow,
  ToolIndicatorRow,
  ToolResultRow,
  UserBubble,
} from './AssistMessage';

import type { AssistTurn, TurnSegment } from '../types';

type AssistTurnRowProps = {
  turn: AssistTurn;
  onConfirm: (toolCallId: string, approved: boolean) => void;
};

export function AssistTurnRow({ turn, onConfirm }: AssistTurnRowProps) {
  if (turn.role === 'user') {
    const seg = turn.segments[0];
    if (seg?.type === 'text') {
      return <UserBubble content={seg.displayContent ?? seg.content} />;
    }
    return null;
  }

  if (turn.segments.length === 0) return null;

  return (
    <div className="space-y-1">
      {turn.segments.map(segment => (
        <SegmentView key={`${segment.type}-${segment.id}`} segment={segment} onConfirm={onConfirm} />
      ))}
    </div>
  );
}

function SegmentView({
  segment,
  onConfirm,
}: {
  segment: TurnSegment;
  onConfirm: (toolCallId: string, approved: boolean) => void;
}) {
  switch (segment.type) {
    case 'text':
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
    case 'stopped':
      return <StoppedRow />;
    default:
      return null;
  }
}

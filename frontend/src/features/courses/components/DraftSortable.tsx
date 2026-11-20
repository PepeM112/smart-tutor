'use client';

import { type DraggableAttributes, type DraggableSyntheticListeners } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { GripVertical } from 'lucide-react';
import { type CSSProperties, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

type HandleProps = {
  label: string;
  /** Not `disabled`: a disabled button drops the focus, and a keyboard drag ends with a save. */
  isDisabled: boolean;
  setActivatorNodeRef: (node: HTMLElement | null) => void;
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
};

/** The 6-dot handle. `touch-none` lets a finger drag it instead of scrolling the page. */
function DragHandle({ label, isDisabled, setActivatorNodeRef, attributes, listeners }: HandleProps) {
  return (
    <button
      type="button"
      ref={setActivatorNodeRef}
      aria-label={label}
      {...attributes}
      {...(isDisabled ? {} : listeners)}
      className={cn(
        'flex h-11 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground outline-none lg:h-8 lg:w-6',
        'hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing',
        isDisabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <GripVertical className="size-4" />
    </button>
  );
}

type SortableRender = {
  handle: ReactNode;
  setNodeRef: (node: HTMLElement | null) => void;
  style: CSSProperties;
  isDragging: boolean;
};

type SortableProps = {
  id: string;
  label: string;
  disabled: boolean;
  children: (props: SortableRender) => ReactNode;
};

// Own translate string: only the move matters (no scale), and `@dnd-kit/utilities` is not a direct dependency.
function sortableStyle(transform: { x: number; y: number } | null, transition: string | undefined): CSSProperties {
  return { transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, transition };
}

/** Gives a render function the sortable props of one id (a section or an item) and its handle. */
function Sortable({ id, label, disabled, children }: SortableProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  const handle = (
    <DragHandle
      label={label}
      isDisabled={disabled}
      setActivatorNodeRef={setActivatorNodeRef}
      attributes={attributes}
      listeners={listeners}
    />
  );
  return <>{children({ handle, setNodeRef, style: sortableStyle(transform, transition), isDragging })}</>;
}

/** A section of the draft: the wrapper moves with the drag, and the header gets the handle. */
export function SortableSection({
  children,
  ...props
}: Omit<SortableProps, 'children'> & { children: (handle: ReactNode) => ReactNode }) {
  return (
    <Sortable {...props}>
      {({ handle, setNodeRef, style, isDragging }) => (
        <div ref={setNodeRef} style={style} className={cn(isDragging && 'relative z-10 opacity-80')}>
          {children(handle)}
        </div>
      )}
    </Sortable>
  );
}

/** An item row of the draft: it hands the sortable props to `CourseItemRow`. */
export const SortableItem = Sortable;

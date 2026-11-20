// @vitest-environment jsdom

import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SortableItem, SortableSection } from './DraftSortable';

function renderEditorPart(disabled: boolean) {
  return render(
    <DndContext>
      <SortableContext items={['s1']}>
        <SortableSection id="s1" label="Drag section One" disabled={disabled}>
          {handle => (
            <section>
              {handle}
              <SortableContext items={['i1']}>
                <SortableItem id="i1" label="Drag item Two" disabled={disabled}>
                  {({ handle: itemHandle, setNodeRef, style }) => (
                    <div ref={setNodeRef} style={style}>
                      {itemHandle}
                    </div>
                  )}
                </SortableItem>
              </SortableContext>
            </section>
          )}
        </SortableSection>
      </SortableContext>
    </DndContext>
  );
}

afterEach(cleanup);

describe('DraftSortable', () => {
  it('gives each section and item a handle with its own label', () => {
    renderEditorPart(false);

    expect(screen.getByRole('button', { name: 'Drag section One' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Drag item Two' })).toBeTruthy();
  });

  it('keeps the handle focusable (not disabled) while a save runs', () => {
    renderEditorPart(true);

    const handle = screen.getByRole('button', { name: 'Drag item Two' });
    expect(handle).toHaveProperty('disabled', false);
    expect(handle.getAttribute('aria-disabled')).toBe('true');
  });
});

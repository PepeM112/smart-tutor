import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_OUTLINE_WIDTH, MIN_OUTLINE_WIDTH, selectOutlineWidth, useOutlineStore } from './useOutlineStore';

const state = () => useOutlineStore.getState();

beforeEach(() => {
  useOutlineStore.setState({ widths: {}, activeKey: null, isOpen: true, isAutoCollapsed: false, isDrawerOpen: false });
});

describe('outline auto-collapse', () => {
  it('opens again when Ask AI closes, if the outline folded for it', () => {
    state().register('course');
    state().autoCollapse();
    expect(state().isOpen).toBe(false);

    state().autoRestore();

    expect(state().isOpen).toBe(true);
    expect(state().isAutoCollapsed).toBe(false);
  });

  it('stays closed when the user closed it', () => {
    state().register('course');
    state().setOpen(false);

    state().autoCollapse();
    state().autoRestore();

    expect(state().isOpen).toBe(false);
  });

  it('stays open when the user reopened it while Ask AI is open', () => {
    state().register('course');
    state().autoCollapse();
    state().setOpen(true);

    state().autoRestore();

    expect(state().isOpen).toBe(true);
    expect(state().isAutoCollapsed).toBe(false);
  });

  it('starts open on the next page', () => {
    state().register('course');
    state().autoCollapse();
    state().unregister();
    state().register('course');

    expect(state().isOpen).toBe(true);
    expect(state().isAutoCollapsed).toBe(false);
  });
});

describe('outline width', () => {
  it('uses the default until a width is saved for the key', () => {
    state().register('course');
    expect(selectOutlineWidth(state())).toBe(DEFAULT_OUTLINE_WIDTH);

    state().setWidth('course', 300.4);

    expect(selectOutlineWidth(state())).toBe(300);
    state().register('other');
    expect(selectOutlineWidth(state())).toBe(DEFAULT_OUTLINE_WIDTH);
  });

  it('never saves a width under the minimum', () => {
    state().setWidth('course', 10);

    expect(state().widths.course).toBe(MIN_OUTLINE_WIDTH);
  });
});

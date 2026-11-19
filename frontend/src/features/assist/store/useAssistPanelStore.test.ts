// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import {
  assistPageKey,
  DEFAULT_ASSIST_WIDTH,
  MIN_ASSIST_WIDTH,
  selectAssistWidth,
  useAssistPanelStore,
} from './useAssistPanelStore';

beforeEach(() => {
  localStorage.clear();
  useAssistPanelStore.setState({ isOpen: false, widths: {} });
});

describe('assistPageKey', () => {
  it.each([
    ['/', '/'],
    ['/notes', '/notes'],
    ['/notes/my-note-01HABC', '/notes'],
    ['/courses/some-course/tests/1', '/courses'],
  ])('maps %s to %s', (pathname, key) => {
    expect(assistPageKey(pathname)).toBe(key);
  });
});

describe('width per page', () => {
  it('uses the default width for a page with no saved width', () => {
    expect(selectAssistWidth('/notes')(useAssistPanelStore.getState())).toBe(DEFAULT_ASSIST_WIDTH);
  });

  it('keeps one width for each page', () => {
    const { setWidth } = useAssistPanelStore.getState();
    setWidth('/notes', 480);
    setWidth('/tests', 360);

    const state = useAssistPanelStore.getState();
    expect(selectAssistWidth('/notes')(state)).toBe(480);
    expect(selectAssistWidth('/tests')(state)).toBe(360);
    expect(selectAssistWidth('/files')(state)).toBe(DEFAULT_ASSIST_WIDTH);
  });

  it('rounds the width and never goes under the minimum', () => {
    const { setWidth } = useAssistPanelStore.getState();
    setWidth('/notes', 412.6);
    setWidth('/tests', 120);

    const state = useAssistPanelStore.getState();
    expect(selectAssistWidth('/notes')(state)).toBe(413);
    expect(selectAssistWidth('/tests')(state)).toBe(MIN_ASSIST_WIDTH);
  });

  it('resets only the width of the given page', () => {
    const { setWidth, resetWidth } = useAssistPanelStore.getState();
    setWidth('/notes', 480);
    setWidth('/tests', 360);
    resetWidth('/notes');

    const state = useAssistPanelStore.getState();
    expect(selectAssistWidth('/notes')(state)).toBe(DEFAULT_ASSIST_WIDTH);
    expect(selectAssistWidth('/tests')(state)).toBe(360);
  });

  it('keeps the width when the sheet closes and opens again', () => {
    const { setWidth, setOpen } = useAssistPanelStore.getState();
    setOpen(true);
    setWidth('/notes', 450);
    setOpen(false);
    setOpen(true);

    expect(selectAssistWidth('/notes')(useAssistPanelStore.getState())).toBe(450);
  });
});

describe('persistence', () => {
  it('saves the widths but not the open state', () => {
    const { setWidth, setOpen } = useAssistPanelStore.getState();
    setOpen(true);
    setWidth('/notes', 450);

    const saved = JSON.parse(localStorage.getItem('assist-panel') ?? '{}');
    expect(saved.state).toEqual({ widths: { '/notes': 450 } });
  });

  it('drops the old mode and dockedWidth fields', async () => {
    localStorage.setItem('assist-panel', JSON.stringify({ state: { mode: 'docked', dockedWidth: 520 }, version: 0 }));

    await useAssistPanelStore.persist.rehydrate();

    const state = useAssistPanelStore.getState();
    expect(state.widths).toEqual({});
    expect(state).not.toHaveProperty('mode');
    expect(state).not.toHaveProperty('dockedWidth');
  });
});

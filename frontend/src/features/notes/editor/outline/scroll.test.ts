// @vitest-environment jsdom

// `scrollToHeading` must open the closed toggles around a heading first: a heading in a closed toggle has no box.
// jsdom has no layout, so a heading counts as "rendered" when no closed toggle is above it, and the chevron
// button opens its toggle like the real `ToggleView` does.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { scrollToHeading } from './scroll';

const scrollIntoView = vi.fn();

/** A toggle with a chevron. The chevron click opens it (the real view does this with React state). */
function addToggle(parent: HTMLElement, open: boolean): HTMLElement {
  const toggle = document.createElement('div');
  toggle.className = 'note-toggle';
  toggle.dataset.open = String(open);
  const chevron = document.createElement('button');
  chevron.className = 'note-toggle-chevron';
  chevron.addEventListener('click', () => {
    toggle.dataset.open = 'true';
  });
  const body = document.createElement('div');
  body.className = 'note-toggle-body';
  toggle.append(chevron, body);
  parent.appendChild(toggle);
  return body;
}

function addHeading(parent: HTMLElement, id: string): HTMLElement {
  const heading = document.createElement('h2');
  heading.id = id;
  // Hidden while a toggle above it is closed.
  heading.getClientRects = () =>
    (heading.closest("[data-open='false']") ? [] : [new DOMRect()]) as unknown as DOMRectList;
  parent.appendChild(heading);
  return heading;
}

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement('div');
  document.body.appendChild(root);
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  root.remove();
  vi.clearAllMocks();
});

describe('scrollToHeading', () => {
  it('scrolls to a heading that is shown', () => {
    addHeading(root, 'intro');

    expect(scrollToHeading(root, 'intro', 'auto')).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
  });

  it('gives false when there is no heading with this id', () => {
    expect(scrollToHeading(root, 'missing', 'auto')).toBe(false);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('opens the closed toggle around the heading, then scrolls', () => {
    const body = addToggle(root, false);
    addHeading(body, 'inside');

    expect(scrollToHeading(root, 'inside', 'smooth')).toBe(true);
    expect(root.querySelector<HTMLElement>('.note-toggle')?.dataset.open).toBe('true');
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('opens every closed toggle of a nested heading and leaves an open one as it is', () => {
    const outer = addToggle(root, false);
    const middle = addToggle(outer, true);
    const inner = addToggle(middle, false);
    addHeading(inner, 'deep');

    expect(scrollToHeading(root, 'deep', 'auto')).toBe(true);
    expect(Array.from(root.querySelectorAll<HTMLElement>('.note-toggle')).map(toggle => toggle.dataset.open)).toEqual([
      'true',
      'true',
      'true',
    ]);
  });

  it('gives false when the heading stays hidden', () => {
    const heading = addHeading(root, 'hidden');
    heading.getClientRects = () => [] as unknown as DOMRectList;

    expect(scrollToHeading(root, 'hidden', 'auto')).toBe(false);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

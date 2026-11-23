import type { MouseEvent } from 'react';

// Clicks that belong to something inside the option, not to the row: the checkbox itself
// (it toggles on its own), a link, or code the user is selecting or copying.
const OWN_CLICK_TARGETS = 'a, pre, button, input';

/** Whether a click on an option row should toggle it. */
export function shouldToggleOnRowClick(event: MouseEvent<HTMLElement>): boolean {
  if (event.target instanceof Element && event.target.closest(OWN_CLICK_TARGETS)) return false;
  return (window.getSelection()?.toString() ?? '') === '';
}

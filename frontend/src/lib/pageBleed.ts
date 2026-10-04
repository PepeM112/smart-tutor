/**
 * Full-height pages (note, files) scroll an inner element, not the page. The app layout pads the page
 * (`px-4 pb-4 lg:px-8 lg:pb-8`), so the scrollbar of that element would sit inside the padding.
 *
 * A "bleeding" element uses a negative margin to cancel the layout padding on the right and at the
 * bottom, and gets the same amount back as padding. Its scrollbar is at the page edge, but its content
 * box is where it was, so the content looks the same. The top and left sides are not touched: the
 * header and the toolbar keep their alignment with the content.
 *
 * Keep the amounts in step with `app/(app)/layout.tsx`.
 */
const marginRight = '-mr-4 lg:-mr-8';
const marginBottom = '-mb-4 lg:-mb-8';
const paddingRight = 'pr-4 lg:pr-8';
const paddingBottom = 'pb-4 lg:pb-8';

export const pageBleed = {
  marginRight,
  marginBottom,
  paddingRight,
  paddingBottom,
  /** Right and bottom together: for an element that scrolls by itself. */
  all: `${marginRight} ${marginBottom} ${paddingRight} ${paddingBottom}`,
} as const;

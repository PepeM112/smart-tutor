/**
 * Classes for the icon buttons at the end of a file tree row.
 * Desktop: hidden until the row has hover or focus, or the menu is open.
 * Touch screens have no hover, so on mobile the buttons are always visible.
 */
export const ROW_ACTION_CLASS =
  'shrink-0 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 lg:data-[state=open]:opacity-100';

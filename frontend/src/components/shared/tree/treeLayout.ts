/** Extra left padding for each level of depth in a tree. */
export const TREE_INDENT_STEP_PX = 16;

/** Left padding of a row at depth 0. */
export const TREE_ROW_BASE_PADDING_PX = 4;

/**
 * Space that the toggle button (`size-5` = 20px) and the row gap (`gap-2` = 8px) use
 * before the name. The column header starts here, to line up with names.
 */
export const TREE_NAME_OFFSET_PX = 28;

/**
 * Width of an actions cell with one button (`icon-sm`, 28px): the `⋮` menu. `w-7` = 28px.
 * Trash rows and list rows with no Eye button use it.
 */
export const ACTIONS_CELL_ONE_BUTTON_CLASS = 'w-7';

/**
 * Width of an actions cell with two buttons (28px each, 2px gap): the note Eye button + the `⋮` menu.
 * Files folder rows have only the menu; the cell aligns it to the right. Rows and the column header use the
 * same class, so the columns line up. `w-15` = 60px.
 */
export const ACTIONS_CELL_TWO_BUTTONS_CLASS = 'w-15';

/** Shared by the lazy body in `AssistSheet` and by the toggle, which calls it early so the chunk is ready at the first open. */
export const loadAssistSheetBody = () => import('./AssistSheetBody');

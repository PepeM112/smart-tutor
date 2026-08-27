export type ToolDefinition = {
  label: string;
  requiresConfirm: boolean;
  queryKeysToInvalidate?: string[][];
};

export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  list_notes: { label: 'Listing notes', requiresConfirm: false },
  list_tests: { label: 'Listing tests', requiresConfirm: false },
  get_note_content: { label: 'Reading note', requiresConfirm: false },
  get_test_details: { label: 'Reading test', requiresConfirm: false },
  search_questions: { label: 'Searching questions', requiresConfirm: false },
  navigate_to: { label: 'Navigating', requiresConfirm: false },
  create_note: { label: 'Creating note', requiresConfirm: true, queryKeysToInvalidate: [['notes']] },
  refine_note: { label: 'Refining note', requiresConfirm: false },
  create_test: { label: 'Creating test', requiresConfirm: true, queryKeysToInvalidate: [['tests']] },
  edit_test: { label: 'Editing test', requiresConfirm: true, queryKeysToInvalidate: [['tests'], ['questions']] },
  refine_questions: { label: 'Refining questions', requiresConfirm: false },
};

export function getToolLabel(name: string): string {
  return TOOL_REGISTRY[name]?.label ?? name;
}

export function isWriteTool(name: string): boolean {
  return TOOL_REGISTRY[name]?.requiresConfirm ?? false;
}

export function getQueryKeysToInvalidate(name: string): string[][] {
  return TOOL_REGISTRY[name]?.queryKeysToInvalidate ?? [];
}

import {
  ArrowRight,
  ClipboardList,
  FilePlus,
  FileText,
  Pencil,
  Search,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';

export type ToolDefinition = {
  label: string;
  icon: LucideIcon;
  /** Mutates user data, as opposed to a read-only lookup. */
  isWrite: boolean;
  /** Pauses for explicit user approval before executing. Currently only `edit_test` uses this;
   * other write tools execute directly (create tools) or via diff accept/reject (refine tools). */
  requiresConfirm: boolean;
  queryKeysToInvalidate?: string[][];
};

export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  list_notes: { label: 'Listing notes', icon: FileText, isWrite: false, requiresConfirm: false },
  list_tests: { label: 'Listing tests', icon: ClipboardList, isWrite: false, requiresConfirm: false },
  get_note_content: { label: 'Reading note', icon: FileText, isWrite: false, requiresConfirm: false },
  get_test_details: { label: 'Reading test', icon: ClipboardList, isWrite: false, requiresConfirm: false },
  search_questions: { label: 'Searching questions', icon: Search, isWrite: false, requiresConfirm: false },
  navigate_to: { label: 'Navigating', icon: ArrowRight, isWrite: false, requiresConfirm: false },
  create_note: {
    label: 'Creating note',
    icon: FilePlus,
    isWrite: true,
    requiresConfirm: false,
    queryKeysToInvalidate: [['notes']],
  },
  refine_note: { label: 'Refining note', icon: Pencil, isWrite: true, requiresConfirm: false },
  create_test: {
    label: 'Creating test',
    icon: ClipboardList,
    isWrite: true,
    requiresConfirm: false,
    queryKeysToInvalidate: [['tests']],
  },
  edit_test: {
    label: 'Editing test',
    icon: Pencil,
    isWrite: true,
    requiresConfirm: true,
    queryKeysToInvalidate: [['tests'], ['questions']],
  },
  refine_questions: { label: 'Refining questions', icon: WandSparkles, isWrite: true, requiresConfirm: false },
};

export function getToolLabel(name: string): string {
  return TOOL_REGISTRY[name]?.label ?? name;
}

export function getToolIcon(name: string): LucideIcon {
  return TOOL_REGISTRY[name]?.icon ?? FileText;
}

export function isWriteTool(name: string): boolean {
  return TOOL_REGISTRY[name]?.isWrite ?? false;
}

export function getQueryKeysToInvalidate(name: string): string[][] {
  return TOOL_REGISTRY[name]?.queryKeysToInvalidate ?? [];
}

import {
  ArrowRight,
  ClipboardList,
  FilePlus,
  FileText,
  Folder,
  FolderInput,
  FolderPlus,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';

/** The label of each tool is the i18n key `assist.tools.<name>` (see `useToolLabel`). Which tools
 * ask for approval is decided by the backend (`requires_confirmation` of its `ToolSpec`), which
 * sends a confirm event, so it is not repeated here. */
export type ToolDefinition = {
  icon: LucideIcon;
  /** Mutates user data, as opposed to a read-only lookup. */
  isWrite: boolean;
  queryKeysToInvalidate?: string[][];
};

export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  list_notes: { icon: FileText, isWrite: false },
  list_folders: { icon: Folder, isWrite: false },
  list_tests: { icon: ClipboardList, isWrite: false },
  get_note_content: { icon: FileText, isWrite: false },
  get_test_details: { icon: ClipboardList, isWrite: false },
  search_user_notes: { icon: Search, isWrite: false },
  search_questions: { icon: Search, isWrite: false },
  navigate_to: { icon: ArrowRight, isWrite: false },
  create_note: {
    icon: FilePlus,
    isWrite: true,
    // The tree feeds the files table and sibling cards. It must show the new note.
    queryKeysToInvalidate: [['notes'], ['folders']],
  },
  refine_note: { icon: Pencil, isWrite: true },
  create_test: { icon: ClipboardList, isWrite: true, queryKeysToInvalidate: [['tests']] },
  edit_test: { icon: Pencil, isWrite: true, queryKeysToInvalidate: [['tests'], ['questions']] },
  refine_questions: { icon: WandSparkles, isWrite: true },
  list_trash: { icon: Trash2, isWrite: false },
  create_folder: { icon: FolderPlus, isWrite: true, queryKeysToInvalidate: [['folders']] },
  move_items: {
    icon: FolderInput,
    isWrite: true,
    // The files tree shows the new places, and the notes list shows each note's folder.
    queryKeysToInvalidate: [['folders'], ['notes']],
  },
  restore_from_trash: {
    icon: RotateCcw,
    isWrite: true,
    queryKeysToInvalidate: [['trash'], ['folders'], ['notes']],
  },
};

export function getToolIcon(name: string): LucideIcon {
  return TOOL_REGISTRY[name]?.icon ?? FileText;
}

export function isWriteTool(name: string): boolean {
  return TOOL_REGISTRY[name]?.isWrite ?? false;
}

export function getQueryKeysToInvalidate(name: string): string[][] {
  return TOOL_REGISTRY[name]?.queryKeysToInvalidate ?? [];
}

// Copy text to the clipboard and tell the user. The code block toolbar, the block handle menu, the outline
// and the link popover share this, so they give the same result and the same toasts. A clipboard that is
// not available (no secure context, or no permission) shows the error toast, and it does not throw.

import { toast } from 'sonner';

type CopyMessages = { copied: string; failed: string };

/** Gives `true` when the text is on the clipboard. A failure shows an error toast and gives `false`. */
export async function copyText(text: string, messages: CopyMessages): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(messages.copied);
    return true;
  } catch {
    toast.error(messages.failed);
    return false;
  }
}

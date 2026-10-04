// Copy the text of a code block to the clipboard and tell the user. The toolbar button of the code block
// and the block handle menu share this, so both give the same result and the same toasts.

import { toast } from 'sonner';

type CopyMessages = { copied: string; failed: string };

/** Gives `true` when the text is on the clipboard. A failure shows an error toast and gives `false`. */
export async function copyCode(text: string, messages: CopyMessages): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(messages.copied);
    return true;
  } catch {
    toast.error(messages.failed);
    return false;
  }
}

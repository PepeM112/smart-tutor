'use client';

import { ArrowUp, Square } from 'lucide-react';
import { useRef, useState } from 'react';

type SlashCommand = {
  name: string;
  description: string;
};

const COMMANDS: SlashCommand[] = [{ name: '/clear', description: 'Clear the conversation' }];

type AssistInputProps = {
  onSend: (text: string) => void;
  onCommand: (command: string) => void;
  isStreaming: boolean;
};

export function AssistInput({ onSend, onCommand, isStreaming }: AssistInputProps) {
  const [draft, setDraft] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const query = draft.startsWith('/') ? draft.slice(1).toLowerCase() : '';
  const filteredCommands = draft.startsWith('/') ? COMMANDS.filter(c => c.name.slice(1).startsWith(query)) : [];
  const commandMenuOpen = !dismissed && draft.startsWith('/') && filteredCommands.length > 0;
  const clampedIndex = Math.min(activeIndex, Math.max(0, filteredCommands.length - 1));

  const canSend = draft.trim().length > 0 && !isStreaming;

  const executeCommand = (cmd: SlashCommand) => {
    onCommand(cmd.name);
    setDraft('');
    setDismissed(false);
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  const handleSend = () => {
    if (!canSend) return;
    onSend(draft.trim());
    setDraft('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (commandMenuOpen && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(i =>
          e.key === 'ArrowDown'
            ? (i + 1) % filteredCommands.length
            : (i - 1 + filteredCommands.length) % filteredCommands.length
        );
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        executeCommand(filteredCommands[clampedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setDismissed(true);
        setDraft('');
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  return (
    <div className="relative mt-auto shrink-0 p-2">
      {/* Slash command menu */}
      {commandMenuOpen && (
        <div className="absolute inset-x-1.5 bottom-full mb-1 rounded-lg border border-border bg-background p-1 shadow-md">
          {filteredCommands.map((cmd, i) => (
            <button
              key={cmd.name}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => executeCommand(cmd)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-75 ${
                i === clampedIndex ? 'bg-muted' : ''
              }`}
            >
              <span className="text-[12px] font-medium text-foreground">{cmd.name}</span>
              <span className="text-[11px] text-muted-foreground">{cmd.description}</span>
            </button>
          ))}
          <div className="mt-0.5 border-t border-border px-2 pt-1 pb-0.5 text-[10px] text-muted-foreground">
            Type to filter commands
          </div>
        </div>
      )}

      <div
        role="presentation"
        onClick={() => inputRef.current?.focus()}
        className="flex cursor-text items-center gap-2 rounded-xl border border-border bg-muted/30 pl-4 pr-2 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.035)] transition-[border-color,box-shadow] duration-150 focus-within:border-ring focus-within:shadow-[0_1px_2px_rgba(0,0,0,0.025)]"
      >
        <textarea
          ref={inputRef}
          value={draft}
          onChange={e => {
            setDraft(e.target.value);
            setDismissed(false);
            handleInput();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything... (/ for commands)"
          aria-label="Message"
          rows={1}
          className="min-h-[28px] w-full content-center resize-none self-center bg-transparent py-[3px] text-[13px] leading-[1.4] text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          aria-label={isStreaming ? 'Stop' : 'Send'}
          disabled={!canSend && !isStreaming}
          onClick={handleSend}
          className="flex size-7 shrink-0 items-center justify-center self-end rounded-lg transition-[background-color,color,transform] duration-200 enabled:active:scale-95"
          style={{
            background: canSend || isStreaming ? 'var(--primary)' : 'var(--muted)',
            color: canSend || isStreaming ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
          }}
        >
          {isStreaming ? <Square className="size-3" /> : <ArrowUp className="size-4" />}
        </button>
      </div>
    </div>
  );
}

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { NoteLength } from '@/client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';

const LENGTH_OPTIONS = [
  { value: undefined, label: 'Auto' },
  { value: NoteLength.SHORT, label: 'Short' },
  { value: NoteLength.MEDIUM, label: 'Medium' },
  { value: NoteLength.LONG, label: 'Long' },
] as const;

export function GenerateNoteDialog() {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const [guidance, setGuidance] = useState('');
  const [length, setLength] = useState<NoteLength | undefined>(undefined);

  const router = useRouter();
  const queryClient = useQueryClient();

  const { mutate: generate, isPending: isGenerating } = useMutation({
    mutationFn: () =>
      sdk.notesGenerate({
        body: {
          topic,
          guidance: guidance || undefined,
          length: length ?? undefined,
        },
      }),
    onSuccess: res => {
      void queryClient.invalidateQueries({ queryKey: ['notes'] });
      toast.success('Note generated');
      setOpen(false);
      resetForm();
      if (!res.data) return;
      router.push(Routes.NOTE_DETAIL(res.data.id));
    },
    onError: () => toast.error('Failed to generate note'),
  });

  function resetForm() {
    setTopic('');
    setGuidance('');
    setLength(undefined);
  }

  return (
    <Dialog open={open} onOpenChange={isGenerating ? undefined : setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg" icon={Sparkles}>
          Generate with AI
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={!isGenerating}
        onInteractOutside={isGenerating ? e => e.preventDefault() : undefined}
        onEscapeKeyDown={isGenerating ? e => e.preventDefault() : undefined}
      >
        {isGenerating ? (
          <div className="flex flex-col items-center justify-center gap-6 py-12">
            <div className="relative">
              <Loader2 className="size-10 animate-spin text-primary" />
              <Sparkles className="absolute -top-1 -right-1 size-4 text-primary animate-pulse" />
            </div>
            <p className="text-sm font-medium text-foreground">Generating your notes…</p>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Generate Study Notes</DialogTitle>
              <DialogDescription>AI will create Markdown study notes based on your topic.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="topic">Topic *</Label>
                <Input
                  id="topic"
                  placeholder="e.g. Photosynthesis, Spanish Subjunctive, TCP/IP Model"
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="guidance">Additional Guidance</Label>
                <Textarea
                  id="guidance"
                  placeholder="e.g. Focus on examples, include mnemonics, target exam prep..."
                  value={guidance}
                  onChange={e => setGuidance(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Length</Label>
                <div className="flex gap-2">
                  {LENGTH_OPTIONS.map(opt => (
                    <Button
                      key={opt.label}
                      type="button"
                      variant={length === opt.value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setLength(opt.value)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => generate()} disabled={!topic.trim()} icon={Sparkles}>
                Generate
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

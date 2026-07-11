'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg" icon={Sparkles}>
          Generate with AI
        </Button>
      </DialogTrigger>
      <DialogContent>
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
              disabled={isGenerating}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="guidance">Additional Guidance</Label>
            <Input
              id="guidance"
              placeholder="e.g. Focus on examples, include mnemonics, target exam prep..."
              value={guidance}
              onChange={e => setGuidance(e.target.value)}
              disabled={isGenerating}
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
                  disabled={isGenerating}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isGenerating}>
            Cancel
          </Button>
          <Button onClick={() => generate()} disabled={!topic.trim() || isGenerating} icon={Sparkles}>
            {isGenerating ? 'Generating...' : 'Generate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

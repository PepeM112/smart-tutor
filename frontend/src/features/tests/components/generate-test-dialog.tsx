'use client';

import { useMutation } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { QuestionType } from '@/client';
import { DialogLoading } from '@/components/shared/dialog-loading';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { useAiAvailable } from '@/hooks/use-ai-available';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';

import { useGenerationStore } from '../store/use-generation-store';

const DIFFICULTY_OPTIONS = [
  { value: 'easy' as const, labelKey: 'difficulty_easy' as const },
  { value: 'medium' as const, labelKey: 'difficulty_medium' as const },
  { value: 'hard' as const, labelKey: 'difficulty_hard' as const },
];

type Props = {
  noteId: string;
  noteTitle: string;
};

export function GenerateTestDialog({ noteId, noteTitle, compact = false }: Props & { compact?: boolean }) {
  const t = useTranslations('test_generation');
  const tCommon = useTranslations('common');
  const tSettings = useTranslations('settings');
  const aiAvailable = useAiAvailable();
  const PROGRESS_MESSAGES = [
    t('progress_reading'),
    t('progress_analyzing'),
    t('progress_crafting'),
    t('progress_tuning'),
    t('progress_reviewing'),
    t('progress_almost'),
  ];
  const [open, setOpen] = useState(false);
  const [questionCount, setQuestionCount] = useState(10);
  const [includeSimple, setIncludeSimple] = useState(true);
  const [includeMC, setIncludeMC] = useState(true);
  const [includeLongText, setIncludeLongText] = useState(false);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [guidance, setGuidance] = useState('');

  const router = useRouter();
  const setResult = useGenerationStore(s => s.setResult);

  const { mutate: generate, isPending: isGenerating } = useMutation({
    mutationFn: () => {
      const questionTypes: QuestionType[] = [];
      if (includeSimple) questionTypes.push(QuestionType.SIMPLE);
      if (includeMC) questionTypes.push(QuestionType.MULTIPLE_CHOICE);
      if (includeLongText) questionTypes.push(QuestionType.LONG_TEXT);

      return sdk.testsGenerate({
        body: {
          noteId,
          questionCount,
          questionTypes,
          difficulty,
          guidance: guidance || undefined,
        },
      });
    },
    onSuccess: res => {
      if (!res.data) return;
      setResult(res.data.questions, res.data.sourceNoteId, res.data.sourceNoteTitle);
      setOpen(false);
      resetForm();
      router.push(Routes.TEST_GENERATE_PREVIEW);
    },
    onError: () => toast.error(t('failed_to_generate')),
  });

  const hasTypeSelected = includeSimple || includeMC || includeLongText;
  const isCountValid = questionCount >= 5 && questionCount <= 30;
  const canGenerate = hasTypeSelected && isCountValid && !isGenerating;

  function resetForm() {
    setQuestionCount(10);
    setIncludeSimple(true);
    setIncludeMC(true);
    setIncludeLongText(false);
    setDifficulty('medium');
    setGuidance('');
  }

  return (
    <Dialog open={open} onOpenChange={isGenerating ? undefined : setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size={compact ? 'icon-lg' : 'lg'}
          icon={Sparkles}
          disabled={!aiAvailable}
          tooltip={!aiAvailable ? tSettings('ai_not_configured') : compact ? t('generate_test') : undefined}
        >
          {!compact && t('generate_test')}
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={!isGenerating}
        onInteractOutside={isGenerating ? e => e.preventDefault() : undefined}
        onEscapeKeyDown={isGenerating ? e => e.preventDefault() : undefined}
      >
        {isGenerating ? (
          <DialogLoading title={t('generating_test')} messages={PROGRESS_MESSAGES} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('generate_from_notes')}</DialogTitle>
              <DialogDescription>{t('generate_from_notes_desc', { noteTitle })}</DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-4">
              <div className="space-y-2">
                <Label htmlFor="question-count">{t('number_of_questions')}</Label>
                <Input
                  id="question-count"
                  type="number"
                  min={5}
                  max={30}
                  value={questionCount}
                  onChange={e => setQuestionCount(Number(e.target.value))}
                  aria-invalid={!isCountValid || undefined}
                />
                {!isCountValid && <p className="text-xs text-destructive">{t('must_be_between')}</p>}
              </div>

              <div className="space-y-2">
                <Label>{t('question_types')}</Label>
                <div className="flex flex-col gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={includeSimple} onCheckedChange={v => setIncludeSimple(v === true)} />
                    <span className="text-sm">{t('simple_type')}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={includeMC} onCheckedChange={v => setIncludeMC(v === true)} />
                    <span className="text-sm">{t('multiple_choice')}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={includeLongText} onCheckedChange={v => setIncludeLongText(v === true)} />
                    <span className="text-sm">{t('long_text_type')}</span>
                  </label>
                </div>
                {!hasTypeSelected && <p className="text-xs text-destructive">{t('select_at_least_one')}</p>}
              </div>

              <div className="space-y-2">
                <Label>{t('difficulty')}</Label>
                <div className="flex gap-2">
                  {DIFFICULTY_OPTIONS.map(opt => (
                    <Button
                      key={opt.value}
                      type="button"
                      variant={difficulty === opt.value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setDifficulty(opt.value)}
                    >
                      {t(opt.labelKey)}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="guidance">{t('additional_guidance')}</Label>
                <Textarea
                  id="guidance"
                  placeholder={t('guidance_placeholder')}
                  value={guidance}
                  onChange={e => setGuidance(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => generate()}
                disabled={!canGenerate}
                icon={Sparkles}
              >
                {tCommon('generate')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

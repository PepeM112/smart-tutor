'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { QuestionType, type QuestionRead } from '@/client';
import { AutoTextarea } from '@/components/shared/auto-textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';

type Props = {
  question?: QuestionRead;
};

type SimpleFormData = {
  prompt: string;
  answers: string[];
  hint: string;
  explanation: string;
  points: number;
};

type MCChoice = { text: string; isCorrect: boolean };

type MCFormData = {
  prompt: string;
  choices: MCChoice[];
  hint: string;
  explanation: string;
  points: number;
};

function initSimpleData(q?: QuestionRead): SimpleFormData {
  if (q && q.questionType === QuestionType.SIMPLE) {
    const content = q.content as { answers?: string[] };
    return {
      prompt: q.prompt,
      answers: content.answers ?? [''],
      hint: q.hint ?? '',
      explanation: q.explanation ?? '',
      points: q.points ?? 1,
    };
  }
  return { prompt: '', answers: [''], hint: '', explanation: '', points: 1 };
}

function initMCData(q?: QuestionRead): MCFormData {
  if (q && q.questionType === QuestionType.MULTIPLE_CHOICE) {
    const content = q.content as { options?: string[]; correctIndices?: number[] };
    const choices = (content.options ?? ['', '']).map((text, i) => ({
      text,
      isCorrect: content.correctIndices?.includes(i) ?? false,
    }));
    return {
      prompt: q.prompt,
      choices,
      hint: q.hint ?? '',
      explanation: q.explanation ?? '',
      points: q.points ?? 1,
    };
  }
  return {
    prompt: '',
    choices: [
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
    ],
    hint: '',
    explanation: '',
    points: 1,
  };
}

export function QuestionForm({ question }: Props) {
  const t = useTranslations('questions');
  const tEditor = useTranslations('test_editor');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEditing = !!question;

  const [questionType, setQuestionType] = useState<QuestionType>(question?.questionType ?? QuestionType.SIMPLE);
  const [simpleData, setSimpleData] = useState<SimpleFormData>(() => initSimpleData(question));
  const [mcData, setMCData] = useState<MCFormData>(() => initMCData(question));

  const { mutate: saveQuestion, isPending } = useMutation({
    mutationFn: () => {
      const body = buildPayload();
      if (isEditing) {
        return sdk.questionsUpdate({ path: { question_id: question.id }, body });
      }
      return sdk.questionsCreate({ body });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['questions'] });
      toast.success(isEditing ? t('question_updated') : t('question_created'));
      router.push(Routes.QUESTIONS);
    },
    onError: () => toast.error(isEditing ? t('failed_to_update') : t('failed_to_create')),
  });

  function buildPayload() {
    if (questionType === QuestionType.SIMPLE) {
      return {
        questionType: QuestionType.SIMPLE,
        prompt: simpleData.prompt,
        content: { answers: simpleData.answers.filter(a => a.trim() !== '') },
        hint: simpleData.hint || null,
        explanation: simpleData.explanation || null,
        points: simpleData.points,
      };
    }
    return {
      questionType: QuestionType.MULTIPLE_CHOICE,
      prompt: mcData.prompt,
      content: {
        options: mcData.choices.map(c => c.text),
        correctIndices: mcData.choices.map((c, i) => (c.isCorrect ? i : -1)).filter(i => i >= 0),
      },
      hint: mcData.hint || null,
      explanation: mcData.explanation || null,
      points: mcData.points,
    };
  }

  type SharedField = keyof SimpleFormData & keyof MCFormData;
  const data = questionType === QuestionType.SIMPLE ? simpleData : mcData;
  const setField = (field: SharedField, value: string | number) => {
    if (questionType === QuestionType.SIMPLE) {
      setSimpleData(prev => ({ ...prev, [field]: value }));
    } else {
      setMCData(prev => ({ ...prev, [field]: value }));
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {!isEditing && (
        <div className="space-y-2">
          <Label>{t('column_type')}</Label>
          <select
            value={String(questionType)}
            onChange={e => setQuestionType(Number(e.target.value) as QuestionType)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value={String(QuestionType.SIMPLE)}>{tEditor('simple')}</option>
            <option value={String(QuestionType.MULTIPLE_CHOICE)}>{t('type_multiple_choice')}</option>
          </select>
        </div>
      )}

      <div className="space-y-2">
        <Label>{tEditor('question_prompt')}</Label>
        <AutoTextarea
          value={data.prompt}
          onChange={e => setField('prompt', e.target.value)}
          placeholder={tEditor('question_prompt_example')}
        />
      </div>

      {questionType === QuestionType.SIMPLE ? (
        <SimpleAnswersEditor data={simpleData} onChange={setSimpleData} />
      ) : (
        <MCChoicesEditor data={mcData} onChange={setMCData} />
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{tEditor('points')}</Label>
          <Input
            type="number"
            min={0.1}
            step={0.1}
            value={data.points}
            onChange={e => setField('points', parseFloat(e.target.value) || 1)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t('hint_label')}</Label>
        <Input value={data.hint} onChange={e => setField('hint', e.target.value)} placeholder={t('hint_placeholder')} />
      </div>

      <div className="space-y-2">
        <Label>{t('explanation_label')}</Label>
        <AutoTextarea
          value={data.explanation}
          onChange={e => setField('explanation', e.target.value)}
          placeholder={t('explanation_placeholder')}
        />
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Button
          onClick={() => {
            saveQuestion();
          }}
          disabled={isPending}
        >
          {isPending ? (isEditing ? t('saving') : t('creating')) : tCommon('save')}
        </Button>
        <Button variant="ghost" onClick={() => router.back()}>
          {tCommon('cancel')}
        </Button>
      </div>
    </div>
  );
}

function SimpleAnswersEditor({ data, onChange }: { data: SimpleFormData; onChange: (d: SimpleFormData) => void }) {
  const tEditor = useTranslations('test_editor');

  return (
    <div className="space-y-2">
      <Label>{tEditor('simple_questions')}</Label>
      {data.answers.map((answer, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={answer}
            onChange={e => {
              const updated = [...data.answers];
              updated[i] = e.target.value;
              onChange({ ...data, answers: updated });
            }}
            placeholder={tEditor('answer_n', { n: i + 1 })}
          />
          {data.answers.length > 1 && (
            <Button
              variant="ghost"
              size="icon-lg"
              onClick={() => onChange({ ...data, answers: data.answers.filter((_, j) => j !== i) })}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          )}
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="gap-1"
        onClick={() => onChange({ ...data, answers: [...data.answers, ''] })}
      >
        <Plus className="size-4" />
        {tEditor('add')}
      </Button>
    </div>
  );
}

function MCChoicesEditor({ data, onChange }: { data: MCFormData; onChange: (d: MCFormData) => void }) {
  const t = useTranslations('questions');
  const tEditor = useTranslations('test_editor');

  return (
    <div className="space-y-2">
      <Label>{t('options_label')}</Label>
      {data.choices.map((choice, i) => (
        <div key={i} className="flex items-center gap-2">
          <Checkbox
            checked={choice.isCorrect}
            onCheckedChange={checked => {
              const updated = [...data.choices];
              updated[i] = { ...choice, isCorrect: !!checked };
              onChange({ ...data, choices: updated });
            }}
          />
          <Input
            value={choice.text}
            onChange={e => {
              const updated = [...data.choices];
              updated[i] = { ...choice, text: e.target.value };
              onChange({ ...data, choices: updated });
            }}
            placeholder={tEditor('option', { n: i + 1 })}
            className="flex-1"
          />
          {data.choices.length > 2 && (
            <Button
              variant="ghost"
              size="icon-lg"
              onClick={() => onChange({ ...data, choices: data.choices.filter((_, j) => j !== i) })}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          )}
        </div>
      ))}
      {data.choices.length < 6 && (
        <Button
          variant="ghost"
          size="sm"
          className="gap-1"
          onClick={() => onChange({ ...data, choices: [...data.choices, { text: '', isCorrect: false }] })}
        >
          <Plus className="size-4" />
          {tEditor('add_choice')}
        </Button>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';

import { QuestionType } from '@/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { AddQuestionDropdown } from './add-question-dropdown';
import { AutoTextarea } from './auto-textarea';
import {
  MultipleChoiceQuestionBlock,
  type Choice,
  type MultipleChoiceQuestionData,
} from './multiple-choice-question-block';
import { SimpleQuestionBlock, type SimpleQuestionData } from './simple-question-block';

type Question = SimpleQuestionData | MultipleChoiceQuestionData;

function newSimple(): SimpleQuestionData {
  return { type: 'simple', prompt: '', answers: '' };
}

function newMultipleChoice(): MultipleChoiceQuestionData {
  return {
    type: 'multiple_choice',
    prompt: '',
    choices: [
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
    ] as Choice[],
  };
}

export function TestEditor() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);

  function addQuestion(type: QuestionType) {
    const q = type === QuestionType.SIMPLE ? newSimple() : newMultipleChoice();
    setQuestions(prev => [...prev, q]);
  }

  function updateQuestion(idx: number, data: Question) {
    setQuestions(prev => prev.map((q, i) => (i === idx ? data : q)));
  }

  function removeQuestion(idx: number) {
    setQuestions(prev => prev.filter((_, i) => i !== idx));
  }

  return (
    <div className="px-8 pb-8 max-w-3xl">
      {/* Title & Description */}
      <div className="space-y-3 mb-6">
        <Input className="w-1/2" placeholder="Test name" value={title} onChange={e => setTitle(e.target.value)} />
        <AutoTextarea
          rows={2}
          placeholder="Description (optional)"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </div>

      {/* Questions */}
      <div className="space-y-3 mb-4">
        {questions.map((q, i) =>
          q.type === 'simple' ? (
            <SimpleQuestionBlock
              key={i}
              data={q}
              onChange={data => updateQuestion(i, data)}
              onRemove={() => removeQuestion(i)}
            />
          ) : (
            <MultipleChoiceQuestionBlock
              key={i}
              data={q}
              onChange={data => updateQuestion(i, data)}
              onRemove={() => removeQuestion(i)}
            />
          )
        )}
      </div>

      {/* Add question */}
      <AddQuestionDropdown onSelect={addQuestion} />

      {/* Save button */}
      <div className="mt-8">
        <Button size="lg" disabled={!title.trim()}>
          Save Test
        </Button>
      </div>
    </div>
  );
}

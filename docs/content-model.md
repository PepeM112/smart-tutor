# Content Model

## Overview

All learning content is user-created. The hierarchy is:

```
User
 └── Test
      ├── Question (standalone)
      └── QuestionGroup
           └── Question (grouped)
```

A **Test** is a named collection of questions (e.g. "Spanish Vocabulary Chapter 3"). Tests belong to a single user and are never shared.

A **QuestionGroup** is an organizational layer within a test. It groups related questions under a shared title and type. The main use case is vocabulary: a group titled "Translate to Spanish" with type `VOCABULARY` containing multiple translation questions. Groups and standalone questions share the same order space within a test, so a test's content can interleave individual questions and groups.

## Question Types

Every question has a `prompt` (the text shown to the user) and a `content` field (JSONB) whose shape depends on the question type.

### Simple

The most common type. The user sees a prompt and types a free-text answer. Multiple valid answers are supported (synonyms).

```
prompt: "How do you say 'to go' in Spanish?"
content: { "answers": ["ir", "marchar"] }
```

Matching is case-insensitive and trimmed. Levenshtein distance provides typo tolerance (see [Answer Grading](answer-grading.md)).

### Multiple Choice

The user sees a question and 2-6 options. One or more can be correct. The user selects all that apply.

```
prompt: "Which are Romance languages?"
content: {
  "options": ["French", "German", "Italian", "Mandarin"],
  "correct_indices": [0, 2]
}
```

Grading is exact: the selected set must match the correct set exactly.

### Long Form (Phase 2)

The user writes a paragraph-style answer. A rubric defines key points with score weights. GPT-4o-mini grades the answer against the rubric and returns structured feedback.

```
prompt: "Explain photosynthesis."
content: {
  "rubric": [
    { "point": "Converts light energy to chemical energy", "weight": 0.4 },
    { "point": "Produces oxygen as byproduct", "weight": 0.3 },
    { "point": "Occurs in chloroplasts", "weight": 0.3 }
  ]
}
```

## Content Validation

The `content` field is stored as JSONB in PostgreSQL, which means the database doesn't enforce its shape. Validation happens at the Pydantic schema layer: when a question is created or updated, a validator checks that `content` matches the expected shape for the question type (`SimpleContent`, `MultipleChoiceContent`, or `LongTextContent`).

This keeps the database schema simple (one `content` column for all types) while still catching malformed data before it's persisted.

## Hints and Explanations

Every question has two optional text fields:

- **hint**: shown to the user *before* they answer (e.g. "Think about irregular verbs")
- **explanation**: shown *after* they answer, regardless of correctness (e.g. "Ir is the most common translation")

## Answer Stripping

When questions are served to the user (for exams or reviews), the answer data is stripped from the `content` field before sending. Simple questions have `answers` removed; MC questions have `correct_indices` removed. The user only sees the prompt and options. Correct answers are revealed only after the user submits their answer via the check/correction endpoints.

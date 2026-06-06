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

### Long Text

The user writes a paragraph-style answer. A rubric defines the criteria the answer will be evaluated against, each with a score weight. An AI model grades the answer against the rubric and returns structured feedback (see [Answer Grading](answer-grading.md#long-text-questions-ai-grading)).

Long Text questions have three length tiers that control the maximum characters allowed:

| Tier   | Enum Value | Char Limit | Roughly           |
| ------ | ---------- | ---------- | ----------------- |
| SHORT  | 1          | ~500       | 3–4 lines         |
| MEDIUM | 2          | ~1800      | 10–15 lines       |
| LONG   | 3          | ~5000      | ~1 page           |

Rubric criteria can be optionally grouped by **category** (e.g. "Context & Causes", "Key Events") for organizational clarity. Categories are purely cosmetic — they don't affect scoring.

```
prompt: "Describe the main events and significance of the Roman Civil War."
content: {
  "length_limit": 3,
  "rubric": [
    { "point": "Identifies the political crisis of the late Roman Republic", "weight": 0.1, "category": "Context & Causes" },
    { "point": "Names the First Triumvirate and its role", "weight": 0.1, "category": "Context & Causes" },
    { "point": "Mentions Caesar crossing the Rubicon (49 BC)", "weight": 0.15, "category": "Key Events" },
    { "point": "Refers to the Battle of Pharsalus (48 BC)", "weight": 0.1, "category": "Key Events" },
    { "point": "Notes Pompey's assassination in Egypt", "weight": 0.05, "category": "Key Events" },
    { "point": "Mentions Caesar's assassination (44 BC)", "weight": 0.1, "category": "Key Events" },
    { "point": "Explains the Second Triumvirate formation", "weight": 0.1, "category": "Key Events" },
    { "point": "Describes Octavian's victory at Actium (31 BC)", "weight": 0.15, "category": "Outcomes" },
    { "point": "Connects the wars to the fall of the Republic and rise of the Principate", "weight": 0.15, "category": "Outcomes" }
  ]
}
```

**Rubric rules:**
- Each `weight` must be a multiple of 0.05 (e.g. 0.05, 0.10, 0.15 ... 1.0)
- Weights are normalized — they represent the proportion of the answer quality each criterion is worth, not exam points
- The sum of all weights determines the question's "total quality" (typically 1.0)
- At least one rubric item is required

**Key differences from Simple/MC:**
- Long Text questions are always **standalone** — they cannot be placed inside QuestionGroups
- Long Text questions are **excluded from SRS** review — they require AI grading, which makes instant feedback impossible
- During exams, Long Text answers receive `PENDING` status until AI grading is completed

## Content Validation

The `content` field is stored as JSONB in PostgreSQL, which means the database doesn't enforce its shape. Validation happens at the Pydantic schema layer: when a question is created or updated, a validator checks that `content` matches the expected shape for the question type (`SimpleContent`, `MultipleChoiceContent`, or `LongTextContent`).

This keeps the database schema simple (one `content` column for all types) while still catching malformed data before it's persisted.

## Hints and Explanations

Every question has two optional text fields:

- **hint**: shown to the user *before* they answer (e.g. "Think about irregular verbs")
- **explanation**: shown *after* they answer, regardless of correctness (e.g. "Ir is the most common translation")

## Answer Stripping

When questions are served to the user (for exams or reviews), the answer data is stripped from the `content` field before sending. Simple questions have `answers` removed; MC questions have `correct_indices` removed; Long Text questions have `rubric` removed (but `length_limit` is kept so the frontend knows how to size the textarea). The user only sees the prompt and input constraints. Correct answers are revealed only after the user submits their answer via the check/correction endpoints.

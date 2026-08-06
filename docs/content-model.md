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

A **Test** is a named collection of questions (e.g. "Spanish Vocabulary Chapter 3"). Tests belong to a single user and are never shared. A test can optionally track its origin via `source_note_id` — a reference to the Note it was generated from (see [AI Test Generation](test-generation.md)). This is `null` for manually-created tests.

A **QuestionGroup** is an organizational layer within a test. It groups related questions under a shared title and type. The main use case is vocabulary: a group titled "Translate to Spanish" with type `VOCABULARY` containing multiple translation questions. Groups and standalone questions share the same order space within a test, so a test's content can interleave individual questions and groups. Each group has a `points` value (default 1.0) that determines its weight in exam scoring.

### Soft Delete

Tests use soft delete. Each test has a `status` field (`ACTIVE` or `DELETED`). Deleting a test sets its status to `DELETED` rather than removing the row. All queries (listing, fetching, SRS review) filter by `ACTIVE` status, so deleted tests are invisible but recoverable.

### Test Versioning (Copy-on-Write)

When a test that has exam results is edited, the system clones the current state into a **frozen version** before applying edits. Existing results and their answers are repointed to the frozen copy so they remain stable against future changes.

**How it works:**
1. User takes an exam → `TestResult` points to the canonical test
2. User edits the test → `version_test_if_needed()` runs before the edit:
   - Clones Test, Questions, and Groups into frozen copies
   - Repoints all `TestResult.test_id` and `Answer.question_id` to the frozen copies
   - Increments `version` on the canonical test
3. Edit is applied to the canonical test (same ID the user has always used)

**Key fields:**
- `Test.version` — integer counter, starts at 1, incremented on each versioning event
- `Test.parent_id` — `NULL` = canonical (user-facing), non-NULL = frozen version pointing to its canonical test
- `Question.origin_id` / `TestQuestionGroup.origin_id` — frozen copies point to their canonical entity (star topology, not chain)

**Query rules:**
- Test list filters `parent_id IS NULL` — frozen versions are hidden from the user
- `get_by_id` does NOT filter by `parent_id` — frozen tests must be fetchable for result detail pages
- SRS queries filter `parent_id IS NULL` — frozen test questions are excluded from review
- Exam submission rejects frozen tests (`parent_id IS NOT NULL` → 400)

**Important invariant:** After repointing, the canonical test has 0 results. Subsequent edits before the next exam are plain edits — no new frozen versions are created. Two quick edits = one frozen version.

The versioning logic lives in `app/services/versioning_service.py`. See [Exams — Results History](exams.md) for how this affects the result detail page.

## Question Types

Every question has a `prompt` (the text shown to the user), a `content` field (JSONB) whose shape depends on the question type, and a `points` value (default 1.0) that determines its weight in exam scoring. For grouped questions, the group's `points` is the scoring source of truth — individual question `points` are ignored.

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

## Notes

Notes are a separate content type — standalone Markdown documents for study material. They are not part of the Test/Question hierarchy but can be used as source material for AI test generation (see [AI Test Generation](test-generation.md)).

For full details, see [Study Notes](study-notes.md).

## Answer Stripping

When questions are served to the user (for exams or reviews), the answer data is stripped from the `content` field before sending. Simple questions have `answers` removed; MC questions have `correct_indices` removed; Long Text questions have `rubric` removed (but `length_limit` is kept so the frontend knows how to size the textarea). The user only sees the prompt and input constraints. Correct answers are revealed only after the user submits their answer via the check/correction endpoints.

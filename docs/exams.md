# Exams

## What Exams Are

An exam is a formal, full-test experience. The user selects a specific test, answers every question in it, submits the whole batch, and gets a scored result. Exam results are persisted and can be reviewed later in the results history.

## Flow

1. User opens a test in "exam mode"
2. All questions in the test are served (with answers stripped)
3. User answers each question
4. User submits all answers at once as a `TestSubmission`
5. Backend grades every answer, creates a `TestResult` with individual `Answer` records. Long Text answers receive `PENDING` status for async AI grading; if grading fails, they transition to `FAILED`.
6. Score is calculated using weighted points: `(earned_points / graded_points) * 100`

## How Exams Differ From Reviews

| Aspect             | Exam                                                          | Review                                |
| ------------------ | ------------------------------------------------------------- | ------------------------------------- |
| Scope              | All questions in one specific test                            | Random questions across all tests     |
| Submission         | Batch (all at once)                                           | One at a time with immediate feedback |
| Results            | Persisted as `TestResult` with score and per-question answers | Not persisted (ephemeral session)     |
| SRS                | Does NOT update SRS state                                     | Updates SRS state after each answer   |
| Question selection | All questions in the test, in order                           | SRS-prioritised (due first, then new) |

The key design decision: **exams don't update SRS state**. Exams are for assessment, reviews are for learning. Mixing the two would make SRS data unreliable — a user cramming for an exam would skew their review schedule.

## Results History

Every exam creates a `TestResult` record containing:

- The test reference and title
- Overall score (percentage)
- Total questions and correct count
- Individual `Answer` records (user's answer + status per question)
- Timestamp

Users can browse their result history to track progress over time on specific tests.

### Versioning and Result Stability

If a test is edited after an exam, copy-on-write versioning ensures the result still shows the test as it was when taken. The result's `test_id` points to a frozen version, not the current canonical test. See [Content Model — Test Versioning](content-model.md#test-versioning-copy-on-write) for full details.

On the result detail page, if the result points to a frozen version (`test.parentId != null`), the frontend shows a "newer version exists" indicator. The result content (questions, answers, scores) always reflects the version the user actually took.

## Weighted Scoring

Each question and question group has a `points` value (default 1.0). This allows different questions to carry different weight in the exam score.

### How Scoring Works

**Standalone questions** (MC, Long Text) use their `points` value directly:
- CORRECT → earns full points
- PARTIAL → earns 50% of points (Simple questions with typo tolerance)
- WRONG → earns 0 points
- PENDING → excluded from both numerator and denominator

**Question groups** are scored at the group level, not per individual question. A group with `points = 2` containing 10 vocabulary words awards points proportionally: `group.points * (correct_count / total_count)`. This avoids rounding accumulation from distributing points to individual questions (e.g. 2/13 = 0.153846... per question).

**Score formula:**
```
earned_points = sum of points earned across all items
graded_points = total_points - pending_points
score = round(earned_points / graded_points * 100, 2)
```

### TestResult Fields

`TestResult` stores both count-based and points-based data:
- `correct_answers`, `total_questions`, `pending_answers` — count fields for display
- `earned_points`, `total_points` — points fields for weighted scoring
- `score` — the final percentage

Legacy results (created before weighted scoring) have `total_points = 0`. The frontend falls back to the count-based format when this is the case.

## Question Groups in Exams

When grading a test submission, the backend collects questions from both the test's standalone questions and all question groups within the test. Standalone questions are scored individually; grouped questions are scored at the group level (see Weighted Scoring above).

## Soft Delete and Exams

Soft-deleted tests (status = `DELETED`) no longer appear in the test listing, so users cannot start new exams on them. Existing results for a deleted test remain in the history and can still be viewed.

## Long Text Questions in Exams

Long Text questions appear in the exam alongside Simple and MC questions. The user writes their answer in a textarea (sized according to the question's length tier). On submission, Long Text answers receive `PENDING` status because they require AI grading.

**Async grading flow:** On submission, Long Text answers are created with `PENDING` status and a `BackgroundTask` fires to grade them via the AI provider. The frontend auto-polls the result every 3 seconds until `pendingAnswers` reaches 0. Once grading completes, the `TestResult` aggregates (score, earned_points, correct_answers, pending_answers) are recalculated.

**Score calculation with PENDING answers:** The exam score excludes PENDING questions' points from the denominator. The score banner shows the points breakdown alongside the percentage.

See [Answer Grading](answer-grading.md#long-text-questions-ai-grading) for details on how AI grading works.

# Exams

## What Exams Are

An exam is a formal, full-test experience. The user selects a specific test, answers every question in it, submits the whole batch, and gets a scored result. Exam results are persisted and can be reviewed later in the results history.

## Flow

1. User opens a test in "exam mode"
2. All questions in the test are served (with answers stripped)
3. User answers each question
4. User submits all answers at once as a `TestSubmission`
5. Backend grades every answer, creates a `TestResult` with individual `Answer` records
6. Score is calculated as `(correct / total) * 100`

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

## Question Groups in Exams

When grading a test submission, the backend collects questions from both the test's standalone questions and all question groups within the test. This means a test with mixed standalone questions and vocabulary groups is graded as a flat list — the grouping is purely organizational, not scoring-related.

## Long Text Questions in Exams

Long Text questions appear in the exam alongside Simple and MC questions. The user writes their answer in a textarea (sized according to the question's length tier). On submission, Long Text answers receive `PENDING` status because they require AI grading.

**Score calculation with PENDING answers:** The exam score excludes PENDING questions from the denominator. If a test has 8 Simple/MC questions and 2 Long Text questions, and the user gets 6 Simple/MC correct, the immediate score is `6/8 = 75%` with "2 questions pending AI review" shown separately. Once AI grading completes, the score is recalculated to include all 10 questions.

See [Answer Grading](answer-grading.md#long-text-questions-ai-grading) for details on how AI grading works.

## Future: Weighted Exam Scoring

Currently, every question contributes equally to the exam score (1 question = 1 unit). This works for homogeneous tests (all vocab, all MC) but becomes unfair when mixing question types — a 30-second MC question shouldn't have the same weight as a full-page essay.

A future enhancement will introduce per-question point values at the exam level. The user (or a default) assigns point values when creating the exam, and the score becomes a weighted sum rather than a simple ratio. Key design points:

- Point values live at the **exam level** (how much this question is worth in this particular exam), not on the question itself (a question could appear in multiple exams with different weights)
- For Long Text questions, the rubric score (0.0–1.0) gets multiplied by the question's point value: `earned = rubric_score * question_points`
- For Simple/MC, CORRECT = full points, WRONG = 0 (PARTIAL scoring for Simple TBD)
- The UI would default to equal weights but allow customisation
- Score display adapts: "27/35 points" or normalised to percentage

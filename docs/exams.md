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

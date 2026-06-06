# Answer Grading

## Overview

Answer grading happens in two contexts:

1. **Single question check** (review flow): the user answers one question at a time, gets immediate feedback, and SRS state is updated.
2. **Full test submission** (exam flow): the user answers all questions in a test, submits them together, and gets a score. No SRS update.

Both flows use the same underlying grading functions, just orchestrated differently.

## Simple Questions: Levenshtein Matching

Simple (free-text) questions are graded using Levenshtein distance, which counts the minimum number of single-character edits needed to transform one string into another.

**Rules per token:**

| Levenshtein Distance | Token Length | Result         |
| -------------------- | ------------ | -------------- |
| 0                    | any          | CORRECT        |
| 1                    | >= 3         | PARTIAL (typo) |
| 1                    | < 3          | WRONG          |
| >= 2                 | any          | WRONG          |

The minimum token length of 3 for typo tolerance prevents false positives on short words (e.g. "ir" vs "or" would be WRONG, not PARTIAL).

**Multi-token answers:** The user can type comma-separated answers (e.g. "ir, marchar"). Each token is graded independently against the valid answer list. The overall result is the *worst* individual result — if any token is WRONG, the whole answer is WRONG.

**Normalization:** Both the user's answer and valid answers are lowercased and trimmed before comparison.

## Multiple Choice Questions: Exact Match

MC grading is strict: the set of selected indices must exactly match the set of correct indices. There's no partial credit — selecting 2 out of 3 correct options is WRONG.

This is a deliberate choice. Partial credit for MC would require weighting logic (how much credit for 2/3 correct but 1 extra?) that adds complexity without much learning value. The SRS system already handles partial mastery through repetition scheduling.

## Long Text Questions: AI Grading

Long Text questions cannot be auto-graded like Simple or MC — they require an AI model to evaluate the answer against the rubric. This creates a fundamentally different grading flow.

### How It Works

1. The user writes a free-text answer (up to the character limit defined by the question's length tier)
2. On submission, the answer receives `PENDING` status — the correction service cannot grade it synchronously
3. An AI model (cheap and capable, not necessarily frontier) evaluates the answer against the rubric criteria
4. The AI receives: the question prompt, the rubric (criteria + weights), and the user's answer
5. For each criterion, the AI determines whether the user adequately addressed it
6. The question's score = sum of weights for criteria the user met (0.0 to ~1.0)

### Rubric Scoring

Rubric weights are **normalized proportions**, not exam points. They represent how much of the answer quality each criterion is worth:

```
Criterion: "Mentions Caesar crossing the Rubicon (49 BC)" → weight: 0.15
Criterion: "Notes Pompey's assassination in Egypt"        → weight: 0.05
```

If the user meets criteria worth 0.75 out of 1.0 total weight, their score for this question is 0.75 (75%).

### Mixed Exams (Auto-Graded + Long Text)

When a test contains both auto-graded questions (Simple/MC) and Long Text questions, the exam score is calculated using weighted points, **excluding PENDING answers' points** from the denominator:

```
earned_points = sum of earned points (CORRECT = full, PARTIAL = 50%, WRONG = 0)
graded_points = total_points - pending_points
score = earned_points / graded_points * 100
```

The score updates once AI grading completes. This avoids penalising the user for questions that simply haven't been graded yet.

### Weighted Scoring Integration

Each question and question group has a `points` value (default 1.0). For Long Text questions, once AI grading completes, the rubric score (0.0–1.0) would be scaled by the question's point value: `rubric_score * question.points`. See [Exams — Weighted Scoring](exams.md#weighted-scoring) for full details on how points-based scoring works across all question types.

### SRS Exclusion

Long Text questions are excluded from the SRS review flow. Since they can't be graded instantly, they can't provide the immediate feedback that drives spaced repetition scheduling. The `_reviewable_base_query` in the CRUD layer explicitly filters them out.

## Answer Statuses

Every graded answer gets one of these statuses:

| Status  | Meaning                                                         |
| ------- | --------------------------------------------------------------- |
| CORRECT | Exact match (or within tolerance for Simple)                    |
| PARTIAL | Close but not exact (Simple only: 1 edit away, word >= 3 chars) |
| WRONG   | Not close enough                                                |
| PENDING | Not yet graded — awaiting AI evaluation (Long Text only)        |

## What the User Sees After Checking

After the answer is graded, the response includes:

- The `status` (CORRECT / PARTIAL / WRONG / PENDING)
- `correctAnswers`: the valid answers as strings (for Simple and MC)
- `correctIndices`: the correct option indices (for MC)
- `srsState`: the updated SRS scheduling data (only in review flow; not applicable for Long Text)
- The question's `explanation` field (if set)

For Long Text questions with `PENDING` status, the response indicates the answer is queued for AI review. Once graded, the rubric breakdown (which criteria were met) will be available in the result.

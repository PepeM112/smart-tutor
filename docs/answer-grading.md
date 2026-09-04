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

**Multi-token answers:** The user can type comma-separated answers (e.g. "ir, marchar"). Each token is graded independently against the valid answer list. The overall result is the _worst_ individual result — if any token is WRONG, the whole answer is WRONG.

**Normalization:** Both the user's answer and valid answers are lowercased and trimmed before comparison.

## Multiple Choice Questions: Exact Match

MC grading is strict: the set of selected indices must exactly match the set of correct indices. There's no partial credit — selecting 2 out of 3 correct options is WRONG.

This is a deliberate choice. Partial credit for MC would require weighting logic (how much credit for 2/3 correct but 1 extra?) that adds complexity without much learning value. The SRS system already handles partial mastery through repetition scheduling.

## Long Text Questions: AI Grading

Long Text questions cannot be auto-graded like Simple or MC — they require an AI model to evaluate the answer against the rubric. This creates a fundamentally different grading flow.

### How It Works

1. The user writes a free-text answer (up to the character limit defined by the question's length tier)
2. On submission, the answer receives `PENDING` status — a `BackgroundTask` is fired to grade it asynchronously
3. The grading service (`grading_service.py`) calls the user's configured `LLMClient` via `get_user_llm_client(user)`, which selects the provider and API key from the user's settings:
   - `anthropic` — Claude Haiku 4.5
   - `openai` — GPT-4o-mini
4. The AI receives: the question prompt, the rubric (criteria + weights), and the user's answer
5. For each criterion, the AI returns `met: true/false` — stored in `Answer.rubric_result` as JSONB
6. The question's score = sum of weights for met criteria, scaled by the question's point value
7. After grading, `TestResult` aggregates (score, earned_points, pending_answers) are recalculated
8. The frontend auto-polls the result every 3 seconds until `pendingAnswers` reaches 0

If grading fails (missing API key, provider API error, unparseable AI response), the answer transitions to `FAILED` status. Errors are categorized (AUTH, API, PARSE, CONFIG) and logged. Failed answers are excluded from score calculation the same way PENDING answers are — they don't penalize the user.

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

### Rubric Result Storage

Each graded Long Text answer stores its rubric result in `Answer.rubric_result` (JSONB):

```json
[
  {
    "point": "Mentions Caesar crossing the Rubicon",
    "met": true,
    "weight": 0.15,
    "reason": "The answer explicitly references Caesar's crossing of the Rubicon in 49 BC."
  },
  {
    "point": "Notes Pompey's assassination in Egypt",
    "met": false,
    "weight": 0.05,
    "reason": "No mention of Pompey's fate in Egypt."
  }
]
```

The answer's `status` is derived from the rubric result:

- All criteria met → `CORRECT`
- Some criteria met → `PARTIAL`
- No criteria met → `WRONG`

### Weighted Scoring Integration

Each question and question group has a `points` value (default 1.0). For Long Text questions, once AI grading completes, the earned points are calculated as: `(earned_weight / total_weight) * question.points`. See [Exams — Weighted Scoring](exams.md#weighted-scoring) for full details on how points-based scoring works across all question types.

### SRS Exclusion

Long Text questions are excluded from the SRS review flow. Since they can't be graded instantly, they can't provide the immediate feedback that drives spaced repetition scheduling. The `_reviewable_base_query` in the CRUD layer explicitly filters them out.

## Answer Statuses

Every graded answer gets one of these statuses:

| Status  | Meaning                                                                                                                     |
| ------- | --------------------------------------------------------------------------------------------------------------------------- |
| CORRECT | Exact match (or within tolerance for Simple)                                                                                |
| PARTIAL | Close but not exact (Simple only: 1 edit away, word >= 3 chars)                                                             |
| WRONG   | Not close enough                                                                                                            |
| PENDING | Not yet graded — awaiting AI evaluation (Long Text only)                                                                    |
| FAILED  | AI grading failed (provider error, parse error, missing API key). Terminal — will not retry automatically. (Long Text only) |

## What the User Sees After Checking

After the answer is graded, the response includes:

- The `status` (CORRECT / PARTIAL / WRONG / PENDING)
- `correctAnswers`: the valid answers as strings (for Simple and MC)
- `correctIndices`: the correct option indices (for MC)
- `srsState`: the updated SRS scheduling data (only in review flow; not applicable for Long Text)
- The question's `explanation` field (if set)

For Long Text questions with `PENDING` status, the response indicates the answer is queued for AI review. Once graded, the rubric breakdown (which criteria were met) is available in `Answer.rubricResult` on the frontend.

## Challenge / Re-evaluation

Users can dispute AI grading results on Long Text questions. If the AI marked a criterion as not met, the user can challenge it by writing an argument explaining why their answer should satisfy that criterion.

### Flow

1. User views a graded Long Text answer and sees criteria marked as not met
2. User selects one or more failed criteria to challenge, writing an argument for each
3. All challenges for one answer are submitted together (`POST /api/v1/answers/{id}/challenge`)
4. The challenge is validated synchronously, then a BackgroundTask processes the AI re-evaluation
5. The AI receives the original question, rubric, user's answer, original verdicts, and the user's arguments
6. For each challenged criterion, the AI returns a new `met` verdict with reasoning
7. If any criterion flips to met, the answer's status and score are recalculated, cascading up to the TestResult

### Rules

- Only criteria currently marked as **not met** can be challenged
- Each criterion can only be challenged **once** (409 Conflict on retry, unless the prior attempt failed)
- Challenges can only **upgrade** verdicts (not met → met), never downgrade
- The AI prompt is deliberately strict and anti-abuse: it rejects emotional appeals and vague assertions, requiring the user to reference specific content in their answer

### Score Recalculation

When a challenge flips a criterion, the system uses `effective_met()` — a helper that returns the challenge verdict if present, otherwise the original verdict. This ensures score computation is consistent whether viewing the original grading or a post-challenge state. If the overall answer status changes (e.g., PARTIAL → CORRECT), the TestResult aggregates (score, earned_points) are recalculated.

### Rubric Result After Challenge

Each challenged criterion gains a `challenge_result` sub-object:

```json
{
  "point": "Mentions Caesar crossing the Rubicon",
  "met": false,
  "weight": 0.15,
  "reason": "No explicit mention found.",
  "challenge_result": {
    "argument": "I referenced 'crossing the river boundary into Roman territory in 49 BC' which is the Rubicon crossing.",
    "met": true,
    "reason": "The answer does reference the Rubicon crossing, albeit indirectly."
  }
}
```

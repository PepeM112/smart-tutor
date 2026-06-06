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

## Answer Statuses

Every graded answer gets one of these statuses:

| Status  | Meaning                                                         |
| ------- | --------------------------------------------------------------- |
| CORRECT | Exact match (or within tolerance for Simple)                    |
| PARTIAL | Close but not exact (Simple only: 1 edit away, word >= 3 chars) |
| WRONG   | Not close enough                                                |
| PENDING | Not yet graded (reserved for Long Form / AI grading in Phase 2) |

## What the User Sees After Checking

After the answer is graded, the response includes:

- The `status` (CORRECT / PARTIAL / WRONG)
- `correctAnswers`: the valid answers as strings (for Simple and MC)
- `correctIndices`: the correct option indices (for MC)
- `srsState`: the updated SRS scheduling data (only in review flow)
- The question's `explanation` field (if set)

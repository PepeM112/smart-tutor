# Review & Spaced Repetition

## What Reviews Are

Reviews are informal, one-at-a-time practice sessions. The user doesn't pick a specific test — instead, the system selects questions from across all their tests, prioritised by what they most need to practice.

Unlike exams, reviews give immediate feedback after each answer and update the SRS scheduling state.

## Review Session Flow

1. Frontend requests a batch of questions (`GET /api/v1/review/questions`)
2. Backend returns up to 10 questions, prioritised by SRS (see below)
3. For each question, the user types an answer and clicks "Check"
4. Backend grades the answer AND updates SRS state as a side effect
5. User sees feedback (correct/wrong/partial + correct answer + SRS debug info in dev mode)
6. After finishing the batch, user sees a summary with score breakdown
7. User can request another batch ("Keep Reviewing") or stop

## Spaced Repetition System (SRS)

### The Problem SRS Solves

Without SRS, review sessions serve random questions. A user who already knows "hola = hello" gets it as often as a word they keep getting wrong. SRS fixes this by scheduling questions based on how well the user knows them.

### The Algorithm: SM-2

SmartTutor uses the SM-2 algorithm (the same one Anki is based on), with Anki's ease floor modification.

Each question has per-user SRS state stored in `UserQuestionState`:

| Field         | Meaning                                                                             |
| ------------- | ----------------------------------------------------------------------------------- |
| `ease_factor` | How "easy" this question is for the user. Starts at 2.5. Higher = longer intervals. |
| `interval`    | Days until the next review.                                                         |
| `repetitions` | How many times in a row the user has gotten it right.                               |
| `next_review` | When this question should next be shown (datetime).                                 |

### How Scheduling Works

After the user answers a question, the answer status is mapped to an SM-2 quality score:

| Answer Status | SM-2 Quality | Effect                                                         |
| ------------- | ------------ | -------------------------------------------------------------- |
| CORRECT       | 5            | Interval grows, ease increases slightly                        |
| PARTIAL       | 3            | Interval grows (less), ease stays roughly flat                 |
| WRONG         | 1            | Interval resets to 1 day, ease drops, repetition streak resets |

**The SM-2 formula:**

```
If quality >= 3 (CORRECT or PARTIAL):
    If first time: interval = 1 day
    If second time: interval = 6 days
    Otherwise: interval = interval * ease_factor
    repetitions += 1
Else (WRONG):
    interval = 1 day
    repetitions = 0

ease_factor += 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
ease_factor = max(1.3, ease_factor)  // Anki's ease floor

next_review = now + interval days
```

**What this means in practice:**

- Get a question right the first time? See it again tomorrow.
- Right again? See it in 6 days.
- Keep getting it right? The interval keeps growing (6 -> 15 -> 38 -> ...).
- Get it wrong at any point? Back to tomorrow, and the ease factor drops (future intervals grow slower).
- The ease factor never drops below 1.3, preventing a question from getting "stuck" at very short intervals forever.

### Question Selection Priority

When the review endpoint fetches questions, it follows this priority:

1. **Due questions first:** Questions where `next_review` is in the past (the user was supposed to review them). Ordered by most overdue first.
2. **New questions second:** Questions the user has never reviewed (no `UserQuestionState` row exists). Selected randomly.
3. **If no questions are due or new:** Returns an empty list with `hasQuestions: true`, so the frontend can show "You're all caught up!"

### Practice Mode

Sometimes users want to practice without SRS constraints. The `?mode=practice` query parameter bypasses SRS and returns random questions, similar to pre-SRS behavior.

The frontend shows a "Practice anyway" button when all questions are caught up, which triggers practice mode.

## Empty States

The review endpoint returns a wrapper with both `questions` (the list) and `hasQuestions` (boolean). This lets the frontend differentiate between two empty states:

| `questions` | `hasQuestions` | Meaning                             | Frontend Shows                            |
| ----------- | -------------- | ----------------------------------- | ----------------------------------------- |
| `[]`        | `false`        | User has no questions at all        | "No questions yet. Create some tests!"    |
| `[]`        | `true`         | User has questions but none are due | "You're all caught up!" + Practice button |

## SRS Dev Panel

When `NEXT_PUBLIC_DEV_MODE=true`, a small debug panel appears below the feedback card after each answer showing the raw SRS state: ease factor, interval (days), repetition count, and next review date. This is purely for development/debugging and is not visible in production.

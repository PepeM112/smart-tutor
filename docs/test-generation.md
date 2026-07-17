# AI Test Generation

## Overview

Rather than writing every question by hand, a user can generate a test directly from a study note. The AI reads the note's content and produces a set of questions matching the user's preferences. Nothing is saved automatically — generated questions go through a preview step where the user accepts, rejects, or refines them before they become a real test.

## Flow

1. The user opens a study note and starts test generation.
2. A preferences form collects:
   - **Question count** — between 5 and 30
   - **Question types** — Simple (free-text), Multiple Choice, or both
   - **Difficulty** — easy, medium, or hard
   - **Guidance** (optional) — free-text instructions, e.g. "focus on dates and events" or "avoid trick questions"
3. The AI generates questions from the note's content and the chosen preferences.
4. The user reviews every generated question in a preview list, accepting or rejecting each one individually.
5. From the preview, the user can also:
   - **Refine with AI** — describe a change in free text (e.g. "make question 3 harder," "add more multiple choice questions") and get back a revised set
   - **Regenerate** — discard everything and start over with new preferences
6. When satisfied, the user saves the accepted questions as a new test.

## Question Types

Only Simple and Multiple Choice questions can be generated:

- **Simple** — the AI produces a prompt and one or more valid answers (including reasonable synonyms).
- **Multiple Choice** — the AI produces a prompt, 2–6 options, and marks which ones are correct.

Long Text questions are deliberately excluded. Designing a rubric — deciding what criteria matter and how to weight them — is a judgment call that belongs to the person who owns the material, not something the AI should decide unsupervised.

## Validation

Every generated question is checked against a set of rules before it's shown to the user:

- The response matches the expected structure.
- Each question's type is one the user actually requested.
- Simple questions have at least one valid answer.
- Multiple Choice questions have between 2 and 6 options with valid correct answers marked.
- No two questions in the generated set share the same prompt.

If the first generation attempt fails validation, the system retries once, telling the AI specifically what was wrong. If the retry also fails, the request is rejected and the user is asked to try again — nothing partial or malformed is ever shown as if it were valid.

## Refinement

Refinement lets the user adjust the current set of questions without regenerating everything from scratch. The user's instructions, along with the current question set, are sent back to the AI, which returns a modified set reflecting the requested change. The preview updates in place, and refinement can be repeated as many times as needed before saving.

## Saving

Saving a generated set creates a test the same way any other test is created. The test keeps a reference to the note it was generated from, so its origin remains visible later. Once saved, generated questions behave exactly like manually written ones — they enter the spaced repetition cycle and show up in future review sessions based on how the user performs on them (see [Review & Spaced Repetition](review-and-srs.md)).

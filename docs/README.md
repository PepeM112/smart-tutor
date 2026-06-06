# SmartTutor Documentation

SmartTutor is a personal, self-paced learning platform. Users create their own content (tests with questions), take exams, and review material using spaced repetition. Think Duolingo, but the user owns and defines the curriculum.

This folder documents **how features work and why they were built this way**. For code-level conventions (naming, file structure, linting), see the `.claude/` config files in the repo root.

## Docs Index

| Document                                        | Covers                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| [Content Model](content-model.md)               | Tests, questions, question types, content shapes, question groups |
| [Answer Grading](answer-grading.md)             | How answers are checked, Levenshtein matching, typo tolerance     |
| [Exams](exams.md)                               | Taking a full test, scoring, results history                      |
| [Review & Spaced Repetition](review-and-srs.md) | Review sessions, SM-2 algorithm, SRS scheduling, practice mode    |
| [Authentication](authentication.md)             | JWT flow, HTTP-only cookies, why not localStorage                 |
| [Architecture Decisions](decisions.md)          | Key technical choices and their rationale                         |

## Project Status

**Implemented:** Tests with three question types (Simple, Multiple Choice, Long Text), question groups, weighted exam scoring with partial credit, SRS-based review sessions, results history.

**In progress:** AI grading for Long Text questions (OpenAI GPT-4o-mini). The rubric structure and PENDING flow are in place — the AI service integration is the next step.

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

## Project Phases

**Phase 1 (current):** Tests, Simple + Multiple Choice questions, exams, review with SRS, results history.

**Phase 2 (planned):** Long Form questions with AI grading (GPT-4o-mini), PWA support.

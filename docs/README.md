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
| [Study Notes](study-notes.md)                   | Note entity, manual & AI-generated Markdown notes, tags, import    |
| [AI Features](ai-features.md)                   | LLM architecture, provider pattern, async grading, error handling |
| [AI Test Generation](test-generation.md)        | Generating tests from notes, preferences, preview, refinement     |

## Project Status

**Implemented:** Tests with three question types (Simple, Multiple Choice, Long Text), question groups, weighted exam scoring with partial credit, AI grading for Long Text (Anthropic Claude Haiku 4.5 / OpenAI GPT-4o-mini), challenge/re-evaluation of AI grading, SRS-based review sessions, results history, study notes with AI generation, AI test generation from notes, soft delete for tests, refresh token authentication.

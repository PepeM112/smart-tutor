# SmartTutor Documentation

SmartTutor is a personal, self-paced learning platform. Users create their own content (tests with questions), take exams, and review material using spaced repetition. Think Duolingo, but the user owns and defines the curriculum.

This folder documents **how features work and why they were built this way**. For code-level conventions (naming, file structure, linting), see the `.claude/` config files in the repo root.

## Docs Index

| Document                                        | Covers                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| [Content Model](content-model.md)               | Tests, questions, question types, content shapes, question groups   |
| [Answer Grading](answer-grading.md)             | How answers are checked, Levenshtein matching, typo tolerance       |
| [Exams](exams.md)                               | Taking a full test, scoring, results history                        |
| [Review & Spaced Repetition](review-and-srs.md) | Review sessions, SM-2 algorithm, SRS scheduling, practice mode      |
| [Authentication](authentication.md)             | JWT flow, HTTP-only cookies, roles, cross-origin cookie handling    |
| [Architecture Decisions](decisions.md)          | Key technical choices and their rationale                           |
| [Study Notes](study-notes.md)                   | Note entity, manual & AI-generated Markdown notes, AI chunk editing |
| [AI Features](ai-features.md)                   | LLM architecture, per-user keys, provider pattern, token tracking   |
| [AI Test Generation](test-generation.md)        | Generating tests from notes, question editing, preview, refinement  |
| [Token Usage & Cost Tracking](token-usage.md)   | Token metering, model pricing, cost calculation, dashboard display  |
| [Ideas & Future Work](IDEAS.md)                 | Deferred ideas (data consolidation, etc.)                           |

## Project Status

**Core features:** Tests with three question types (Simple, Multiple Choice, Long Text), question groups, weighted exam scoring with partial credit, SRS-based review sessions, results history, study notes with AI generation, soft delete for tests, Question Bank (standalone questions with filtering/sorting/pagination/bulk actions).

**AI features:** AI grading for Long Text (Anthropic Claude Haiku 4.5 / OpenAI GPT-4o-mini), challenge/re-evaluation of AI grading, AI test generation from notes (all three question types), AI chunk editing for notes and test questions, token usage tracking with cost estimation.

**User system:** JWT authentication with refresh tokens (HTTP-only cookies), per-user AI API key storage (Fernet encrypted), user roles (admin/user), user preferences (theme, locale, font size, SRS settings).

**Frontend:** 12 color themes (8 light + 4 dark), full i18n (English + Spanish), mobile/tablet/desktop responsive design, PWA installable.

**Infrastructure:** Backend on Render, frontend on Vercel, database on Neon.tech (PostgreSQL).

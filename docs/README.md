# SmartTutor Documentation

This folder documents **how features work and why they were built this way**. For project overview and getting started, see the [root README](../README.md). For code-level conventions, see `.claude/PATTERNS.md`.

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
| [AI Features](ai-features.md)                   | LLM architecture, per-user keys, provider pattern, RAG, token tracking |
| [AI Test Generation](test-generation.md)        | Generating tests from notes, question editing, preview, refinement  |
| [AI Assistant](ai-assistant.md)                 | Chat panel, SSE protocol, agentic tool-calling, streaming pipeline  |
| [Token Usage & Cost Tracking](token-usage.md)   | Token metering, model pricing, cost calculation, dashboard display  |
| [Ideas & Future Work](IDEAS.md)                 | Deferred ideas (data consolidation, etc.)                           |

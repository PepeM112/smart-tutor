# Architecture Decisions

Key technical choices and why they were made.

---

## SQLAlchemy + Pydantic over SQLModel

**Decision:** Use SQLAlchemy 2.0 for ORM and Pydantic v2 for schemas, kept separate.

**Why not SQLModel?** SQLModel merges ORM models and Pydantic schemas into one class. In practice, this caused compatibility issues with Pydantic v2 features (custom validators, alias generators, `ConfigDict` options). Keeping them separate is more code but avoids fighting the abstraction.

**How it works:** Models in `models/` define the database schema. Schemas in `schemas/` define the API contract. They mirror each other but serve different purposes, and each can evolve independently.

---

## JSONB Content Field for Questions

**Decision:** Store question-type-specific data (answers, options, rubrics) as a single JSONB column.

**Alternative considered:** Separate tables per question type (e.g. `simple_question_answers`, `mc_question_options`).

**Why JSONB:** A single `content` column keeps the schema simple and avoids JOINs when reading questions. Adding a new question type (like Long Form) requires zero schema migrations — just a new Pydantic validator. The tradeoff is that the database can't enforce the shape; validation happens at the application layer via Pydantic.

---

## SRS State as a Separate Table

**Decision:** SRS scheduling data lives in `UserQuestionState`, not on the `Question` model.

**Why:** Questions are shared content definitions. SRS state is per-user. If SRS fields lived on `Question`, we'd need a join table anyway for multi-user support (even though this is currently single-user). The separate table also means the `Question` model stays clean and focused on content, while SRS concerns are isolated.

---

## SM-2 as a Pure Function

**Decision:** The SM-2 algorithm is implemented as a pure function (`apply_sm2`) that takes the current state and quality score, and returns the new state. No database access, no side effects.

**Why:** Testability. The SM-2 math can be unit-tested exhaustively without any database setup. The orchestration (get-or-create state, apply SM-2, persist) lives in `record_answer`, which is a thin wrapper. This also makes it easy to swap algorithms later — replace `apply_sm2` without touching the persistence logic.

---

## Exams Don't Update SRS

**Decision:** Taking an exam does not create or modify `UserQuestionState` rows.

**Why:** Exams are for assessment ("how well do I know this test?"), reviews are for learning ("help me remember what I keep forgetting"). If exams updated SRS, a user cramming the same test repeatedly would artificially inflate their SRS intervals, defeating the purpose of spaced repetition. The `check_question` service has an `update_srs` flag (defaults to `True`) so future callers can opt out.

---

## Review Endpoint Returns a Wrapper, Not a Bare List

**Decision:** `GET /api/v1/review/questions` returns `{ questions: [...], hasQuestions: bool }` instead of just a list.

**Why:** The frontend needs to distinguish between "no questions exist" (show "create some tests first") and "questions exist but none are due" (show "you're all caught up"). A bare empty list can't convey this distinction. The `hasQuestions` boolean is cheap to compute (single EXISTS query) and avoids a second API call.

---

## HTTP-only Cookies for Auth

**Decision:** JWT stored in HTTP-only cookies, not localStorage.

**Why:** Eliminates XSS token theft entirely. The browser handles cookie transmission automatically, so the frontend doesn't need manual `Authorization` header logic. The tradeoff is CORS configuration (`credentials: 'include'` + `allow_credentials=True`), which is a one-time setup.

See [Authentication](authentication.md) for full details.

---

## Three-Layer Backend (Route -> Service -> CRUD)

**Decision:** Strict separation between HTTP handling (routes), business logic (services), and database operations (CRUD).

**Why:**

- **Routes** only handle HTTP concerns: status codes, request/response serialization, parameter extraction.
- **Services** own business rules: authorization checks, validation, orchestrating multiple CRUD calls, raising `HTTPException`.
- **CRUD** functions are atomic database operations: query, insert, update, delete. They never raise HTTP errors.

This means CRUD functions are reusable across services without importing HTTP concerns, and services can be tested without spinning up a web server.

---

## ULIDs for Primary Keys

**Decision:** All primary keys are ULID strings (26 characters), not auto-incrementing integers or UUIDs.

**Why:** ULIDs are sortable by creation time (unlike UUIDv4), URL-safe (unlike UUID with dashes), and globally unique (unlike auto-increment). They're generated client-side at insert time, which avoids a database round-trip for ID generation. Stored as `String(26)` in PostgreSQL.

---

## camelCase API Contract

**Decision:** All Pydantic schemas use `alias_generator=to_camel`, so the API speaks camelCase while Python code uses snake_case.

**Why:** The frontend is TypeScript, which conventionally uses camelCase. Rather than translating field names in the frontend, the backend serializes to camelCase automatically. All schemas inherit from `BaseSchema` which configures this, so it's enforced globally.

**Watch out:** Any `JSONResponse` with hand-built dicts (bypassing Pydantic) must use camelCase keys manually, or the frontend will get `undefined` for those fields.

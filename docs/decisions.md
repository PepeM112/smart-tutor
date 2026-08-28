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

---

## Long Text: Normalized Rubric Weights, Not Exam Points

**Decision:** Rubric weights on Long Text questions are normalized proportions (summing to ~1.0), not absolute exam point values.

**Why:** The rubric answers a single question: "how well did the student cover the material?" A weight of 0.15 means "this criterion is 15% of the answer quality." This is independent of how many exam points the question is worth. Separating these concerns keeps the rubric clean — the `points` field on the Question controls how much the question is worth in the exam.

---

## Points on Question + TestQuestionGroup, Not a Separate Exam Entity

**Decision:** The `points` field lives directly on `Question` and `TestQuestionGroup`, not on a separate Exam entity.

**Why:** Questions belong to at most one test (`test_id` is nullable — bank questions have none). Assigning a bank question to a test creates a copy, not a shared reference. Putting points directly on the models is unambiguous. An Exam entity would only be needed for teacher-student flows, which don't exist yet.

---

## Group Points Computed at Scoring Time, Not Distributed

**Decision:** Group points are not distributed to individual questions. Scoring is computed at the group level as `group.points * (correct / total)`.

**Why:** Distributing `2 / 13 = 0.153846...` to each question and storing it causes rounding accumulation (`0.15 * 13 = 1.95 ≠ 2.0`). Computing the proportion once at scoring time avoids this entirely.

---

## Float Storage for Points, Not Integers

**Decision:** Points are stored as floats, not integers (no cents-style integer math).

**Why:** At exam-score scale (small numbers, 2 decimal places, `round()` at the end), float precision is a non-issue. Integer storage would require multiplying/dividing by 100 everywhere, adding unnecessary complexity.

---

## PARTIAL Credit = 50% Points

**Decision:** PARTIAL answers earn 50% of the question's point value. Applies uniformly: standalone questions get `points * 0.5`, grouped questions count as 0.5 toward the group's correct count.

**Why:** PARTIAL status already existed for Simple questions (typo tolerance with Levenshtein distance = 1). Previously it earned 0 points. Giving 50% credit makes it meaningful — a close-enough answer is better than wrong.

---

## Long Text: 3-Tier Length Limits Over Free-Form

**Decision:** Long Text questions use a `LongTextLength` enum (SHORT/MEDIUM/LONG) instead of a free-form max character count.

**Why:** Simpler UX (dropdown vs. number input) and maps cleanly to the real-world exam formats this feature emulates: "3–4 lines" (SHORT, ~500 chars), "10–15 lines" (MEDIUM, ~1800 chars), "~1 page" (LONG, ~5000 chars). If we ever need a custom limit, we can add a fourth tier rather than switching to free-form.

---

## Long Text: Standalone Only, No SRS

**Decision:** Long Text questions cannot be placed inside QuestionGroups and are excluded from SRS review.

**Why standalone:** QuestionGroups exist for batch question patterns like vocabulary tables. An essay prompt with a multi-criterion rubric is a fundamentally different UX that doesn't benefit from grouping.

**Why no SRS:** SRS requires instant grading to provide the immediate feedback that drives scheduling (CORRECT → longer interval, WRONG → shorter interval). Long Text grading is asynchronous (AI-dependent), so it can't participate in the review loop. The CRUD layer's `_reviewable_base_query` already filters Long Text out.

---

## Soft Delete Over Hard Delete

**Decision:** Deleting a test sets `status = DELETED` rather than removing the row.

**Why:** Hard delete would cascade to questions, answers, and test results — destroying the user's history. Soft delete preserves all related data while hiding the test from active use. The `TestStatus` enum (`ACTIVE`, `DELETED`) keeps the implementation simple, and all queries filter by status.

---

## Dual-Token Auth (Access + Refresh)

**Decision:** Use short-lived access tokens (30 minutes) paired with long-lived refresh tokens (30 days), both as HTTP-only cookies.

**Why:** Short access tokens limit the damage window if a token is somehow compromised. The refresh token allows seamless re-authentication — the user stays logged in for up to 30 days without re-entering credentials. The frontend's 401 interceptor handles token renewal transparently. Both tokens being HTTP-only maintains the XSS protection of the original single-token design.

---

## Shared LLM Client Abstraction

**Decision:** All AI features go through a single `LLMClient` ABC in `services/llm.py`, with Anthropic and OpenAI implementations swappable via one env var (`AI_GRADING_PROVIDER`).

**Why:** Four AI features (grading, challenge re-evaluation, note generation, test generation) all need LLM access. A shared abstraction avoids duplicating provider-specific code (API key validation, error handling, response parsing) across each feature. The singleton factory (`get_llm_client()`) ensures consistent provider selection. Each feature follows its own `*_service.py` + `*_prompts.py` pattern, calling `LLMClient.complete()` for the AI interaction.

---

## Strategy Pattern Tried and Reverted for Grading

**Decision:** An early attempt at a `grading/` sub-package with a Strategy Pattern was removed in favor of flat `grading_service.py` + `grading_prompts.py`.

**Why:** The Strategy Pattern introduced an abstraction layer (provider interface, factory, registry) that added complexity without benefit — the provider switching was already handled cleanly by `LLMClient`. The flat `*_service.py` + `*_prompts.py` convention is the project standard. Do not reintroduce a `grading/` sub-package.

---

## BackgroundTask + Poll for Async AI Operations

**Decision:** AI-backed operations (grading, challenge re-evaluation) use FastAPI's `BackgroundTask` for async processing, with the frontend polling until completion.

**Why:** LLM calls take 2–10+ seconds — too slow for a synchronous request. The pattern: create the record with a pending state, return the HTTP response immediately, fire a `BackgroundTask` to call the AI, update the record when done. The frontend polls every 3 seconds until the pending count reaches zero. This avoids WebSocket complexity while keeping the UX responsive.

---

## Challenge Verdicts Only Upgrade, Never Downgrade

**Decision:** When a user challenges a grading criterion, the re-evaluation can only flip "not met" to "met", never the reverse.

**Why:** The challenge flow is a user appeal, not a full re-grade. Allowing downgrades would create a perverse incentive — users would avoid challenging for fear of losing points they already earned. The one-directional rule makes challenges risk-free, encouraging users to engage with the feedback rather than accept it passively.

---

## Per-User API Keys Over Global Environment Variable

**Decision:** AI features use per-user API keys stored encrypted in the database, not a global `AI_GRADING_PROVIDER` env var.

**Why:** Users bring their own keys (Anthropic or OpenAI), configured in Settings. Keys are encrypted at rest using Fernet (`services/encryption.py`). `get_user_llm_client(user)` creates a client from the user's decrypted key. The old env-var-based `get_llm_client()` remains as a fallback for system-level operations. This makes the app self-hostable without the operator providing AI keys.

---

## Fernet Encryption for API Keys at Rest

**Decision:** User API keys are encrypted with Fernet symmetric encryption before storage.

**Why:** API keys in plaintext in the DB would be a breach liability. Fernet provides authenticated encryption (encrypt + HMAC). The encryption key is an env var (`ENCRYPTION_KEY`), not stored in the DB. Trade-off: if the encryption key is lost, all stored API keys become unrecoverable — but that's preferable to storing them in plain text.

---

## Edit-in-Place for Bank Questions (No Copy-on-Write)

**Decision:** Bank questions (standalone, `test_id = NULL`) are edited in place. No versioning or frozen copies.

**Why:** SRS state is tied to the question's ID via `UserQuestionState`. Copy-on-write would create a new question ID, losing the user's review history. Test-level versioning (`version_test_if_needed()`) already protects exam history for test-owned questions — bank questions have no exam results to protect.

---

## Bulk Operations Skip Unowned Items

**Decision:** `bulk_delete` and `bulk_assign` silently skip questions the user doesn't own, rather than failing the entire batch.

**Why:** A batch of 20 IDs with 1 stale/unowned entry shouldn't block the other 19. The response includes counts of processed vs skipped items so the frontend knows what happened. This is a UX trade-off — failing the whole batch would require the user to identify and remove the bad ID manually.

---

## Cookie-Based Theme and Locale for SSR

**Decision:** Theme and locale are persisted in both localStorage (client) and cookies (SSR). The server reads cookies to set `data-theme` and locale on the initial HTML render.

**Why:** Without server-side knowledge of the theme, the first render uses the default, causing a flash of wrong theme (FOIT). Cookies are readable in Next.js server components via `cookies()`. localStorage alone would require client-side hydration to apply the theme, which causes a visible flash.

---

## Token Costs as Strings in the API

**Decision:** Cost values (`estimated_cost`, `total_estimated_cost`) are serialized as strings in JSON responses, not numbers.

**Why:** Per-token prices have many decimal places (e.g., `0.000001`). JavaScript floats lose precision on such values (`0.1 + 0.2 !== 0.3`). Using `Decimal` on the backend and `string` in the API preserves full precision. The frontend formats with `toFixed()` at display time.

---

## OpenRouter as Model Pricing Source

**Decision:** Model prices are fetched from OpenRouter's public API (`GET https://openrouter.ai/api/v1/models`), not hardcoded.

**Why:** Neither Anthropic nor OpenAI exposes a pricing API. OpenRouter maintains accurate, up-to-date pricing for both providers, freely queryable (no auth). Prices are stored in `model_pricing` with `valid_from`/`valid_to` date ranges so historical cost calculations remain accurate when prices change. A mapping dict (`SDK_TO_OPENROUTER` in `core/model_registry.py`) translates between SDK model IDs (e.g., `claude-haiku-4-5-20251001`) and OpenRouter IDs (e.g., `anthropic/claude-haiku-4.5`).

---

## Same-Origin API Proxy Over Cross-Origin Cookies

**Decision:** API calls are proxied through Next.js rewrites (`/api/:path*` -> `${BACKEND_URL}/api/:path*`) instead of calling the backend directly from the browser.

**Why:** iOS Safari standalone mode (PWA) partitions or blocks third-party cookies, which broke login on mobile when the frontend (Vercel) and backend (Render) were on different domains. The rewrite proxy makes all API calls same-origin from the browser's perspective, so cookies use `SameSite=Lax` in both environments — no cross-origin cookie configuration needed. This also eliminated the need for `NEXT_PUBLIC_API_URL` (a client-side env var); it was replaced by `BACKEND_URL` (server-side only, never exposed to the browser).

---

## i18n Without URL Prefixes

**Decision:** Locale is stored in a cookie, not in the URL path (`/en/dashboard` vs `/dashboard`).

**Why:** SmartTutor is a personal app, not a content site. Locale-prefixed URLs add routing complexity (middleware, link rewriting, redirects) without SEO benefit — the content is private and behind auth. A cookie-based approach keeps URLs clean and is simpler to implement with Next.js App Router.

---

## Stateless Backend for AI Assistant Conversations

**Decision:** The Assistant endpoint (`POST /api/v1/assist`) keeps no conversation state. The client sends the full message history on every request, including every follow-up and every confirmation round-trip.

**Alternative considered:** A `conversation`/`message` table, with the client sending only the new message and an id.

**Why:** The app has no other multi-turn, long-lived server session anywhere else, so a conversation store would be new infrastructure (persistence, retention, cleanup) built for exactly one feature. Chat history isn't a durable asset the way tests and notes are — losing it on reload is an acceptable tradeoff for a personal, single-user app. Resending the full history costs more tokens per call as a conversation grows, but conversations here are short-lived by nature (they're grounded in the current page, not a long-term thread), so the cost has not been a problem in practice.

---

## Producer–Consumer Queue for Assistant Streaming

**Decision:** The frontend does not render SSE events as they arrive. `use-stream-queue.ts` buffers them in a FIFO and gates non-text events (a tool call, a tool result, a confirmation card) behind the full reveal of whatever text preceded them.

**Why:** The Assistant's word-by-word text reveal happens slower than the network delivers events. Without a queue, a tool-call event arriving mid-reveal would render its indicator immediately, visually splitting a still-typing sentence into two bubbles. Gating boundary events on reveal progress — rather than on arrival — keeps what's on screen in wire order regardless of how fast the model or the network is relative to the reveal animation. See [AI Assistant](ai-assistant.md#streaming-reveal-pipeline) for the mechanism.

---

## Two Confirmation Patterns for Assistant Write Tools

**Decision:** `create_note`, `create_test`, and `edit_test` pause server-side and require an explicit approve/reject before running (`confirm_required`). `refine_note` and `refine_questions` run immediately and instead surface an old/new diff for the user to accept or reject afterward.

**Why:** The first group either creates something from nothing or removes content outright — there's no natural "before" to show, so an upfront yes/no gate is the only sensible review. The second group revises something that already exists, which produces a natural diff — showing the actual before/after is a clearer review than a plain description of the pending change would be, and both are reversible (the diff panel can reject; `edit_test`'s question removals separately get an undo toast since they're a soft delete). The cost is an extra tool-name distinction to remember (`WRITE_TOOLS` vs. everything else) rather than one uniform rule for all write tools.

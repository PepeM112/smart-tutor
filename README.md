# SmartTutor

A full-stack learning platform where users create their own study content, take exams, and retain knowledge through spaced repetition — with AI grading, content generation, semantic search (RAG), and an agentic chat assistant.

<!-- VIDEO: 30–60s walkthrough — create a test, take an exam, see the result, review with SRS. Show the AI Assistant asking about a note and navigating to it. -->

## Highlights

- **AI-powered learning** — 8 AI capabilities including LLM grading, content generation, agentic chat with tool calling, and RAG-based semantic search
- **Multi-provider AI** — per-user Anthropic / OpenAI configuration with encrypted key storage, token metering, and real-time cost tracking
- **Streaming architecture** — Server-Sent Events for incremental AI responses with a producer–consumer pipeline that keeps visual order consistent
- **Type-safe API contract** — OpenAPI schema auto-generates TypeScript client types; backend Pydantic schemas and frontend types are always in sync
- **Clean separation of concerns** — three-layer backend (Route → Service → CRUD), feature-driven frontend modules, no business logic in route handlers

## Features

### Content & Exams

Users build **Tests** — collections of questions mixing three types:

| Type | How it works |
|------|-------------|
| **Simple** | Free-text answer with synonym support and typo tolerance (Levenshtein distance) |
| **Multiple Choice** | 2–6 options, one or more correct |
| **Long Text** | Paragraph answer graded by AI against a weighted rubric |

Tests support **question groups** (batch patterns like vocabulary tables), **weighted scoring** with partial credit, and **copy-on-write versioning** so editing a test after an exam preserves the original in results.

<!-- VIDEO: Creating a test with mixed question types, taking an exam, reviewing the scored result -->

### Spaced Repetition (SRS)

An SM-2 algorithm schedules review sessions based on past performance — correct answers increase the interval, wrong answers reset it. The review flow is separate from exams: exams assess, reviews teach.

### Study Notes & AI Generation

Markdown study notes with a split-panel editor (raw + live preview). Notes can be AI-generated from a topic, refined chunk-by-chunk, and used as source material for test generation.

<!-- VIDEO: Generating a study note from a topic, then generating a test from that note -->

### Question Bank

Standalone questions (not tied to a test) with server-side filtering, sorting, pagination, and bulk actions (delete, assign to test, duplicate).

### AI Features

Eight AI capabilities, all with per-user provider selection and token cost tracking:

| # | Capability | Description |
|---|-----------|-------------|
| 1 | **Long Text Grading** | Evaluates paragraph answers against rubric criteria with per-criterion verdicts |
| 2 | **Challenge Re-evaluation** | Re-assesses disputed grading with additional context from the user |
| 3 | **Note Generation** | Creates Markdown study material from a topic and optional guidance |
| 4 | **Test Generation** | Generates questions from study notes with configurable count, difficulty, and types |
| 5 | **Note Chunk Editing** | Rewrites a selected section of a note based on user instruction |
| 6 | **Question Editing** | AI-edits selected questions in a test editor or preview |
| 7 | **AI Assistant** | Agentic chat panel with 12 tools — reads content, navigates the app, creates and edits resources |
| 8 | **Semantic Search (RAG)** | Notes are chunked and embedded (pgvector + HNSW), enabling meaning-based retrieval |

<!-- VIDEO: AI Assistant conversation — user asks about their notes, assistant calls search_user_notes, reads a note, then generates a test from it, all in one streaming conversation -->

### AI Assistant — Agentic Chat

A floating/dockable chat panel available on every page. The assistant can:

- **Read** the user's notes, tests, and questions
- **Search** semantically across all notes using RAG embeddings
- **Navigate** the app to any page
- **Create** notes and tests (executes immediately, user reviews the result)
- **Edit** tests with confirmation (rename, remove questions — shows accept/reject card)
- **Refine** notes and questions (executes, then shows old/new diff for review)

The backend runs an agentic loop of up to 6 tool-calling rounds per request, streaming text deltas over SSE. The frontend uses a producer–consumer pipeline with a `requestAnimationFrame` reveal loop that preserves visual ordering even when tool results arrive mid-text.

### Token Usage & Cost Tracking

Every AI call is metered — input/output tokens, model, provider, feature, and estimated cost. Users see their usage on a dashboard with stacked bar charts (group by provider, feature, or both), stat cards, and time-range filters. Cost is calculated from model pricing fetched via OpenRouter's API.

<!-- VIDEO: Stats page showing token usage chart with filtering by provider and feature, hovering to see per-action costs -->

### Additional Features

- **12 color themes** (8 light + 4 dark) with system-preference detection
- **Internationalization** — full English and Spanish support (next-intl)
- **Responsive design** — mobile, tablet, and desktop layouts
- **PWA** — installable as a native app with offline manifest
- **Soft delete** for tests with restore capability

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16 (App Router), TypeScript (strict), Tailwind CSS, TanStack Query v5, Zustand, Tiptap, Recharts |
| **Backend** | FastAPI, Python 3.12+, SQLAlchemy 2.0, Pydantic v2, Alembic |
| **Database** | PostgreSQL (Neon.tech) with pgvector (embeddings) and pg_trgm (fuzzy text search) |
| **Auth** | JWT via HTTP-only cookies (passlib + bcrypt) |
| **AI** | Anthropic Claude Haiku 4.5 / OpenAI GPT-4o-mini (LLM), OpenAI text-embedding-3-small (RAG) |
| **API Contract** | OpenAPI schema → auto-generated TypeScript client (hey-api) |
| **Infrastructure** | Docker Compose (local), Render (backend), Vercel (frontend) |

## Architecture

### Backend — Three-Layer Pattern

```
Route → Service → CRUD → Model
```

- **Routes** (`api/v1/endpoints/`) — HTTP concerns only: status codes, request/response shapes
- **Services** (`services/`) — business logic, validation, orchestration, AI calls
- **CRUD** (`crud/`) — atomic database operations, no business logic
- **Models** (`models/`) — SQLAlchemy ORM classes
- **Schemas** (`schemas/`) — Pydantic validation with camelCase aliasing for the API contract

### Frontend — Feature-Driven Modules

```
src/
├── components/ui/       # UI primitives (shadcn) — no business logic
├── features/            # Feature modules with co-located components, stores, hooks
│   ├── auth/
│   ├── tests/
│   ├── notes/
│   ├── history/
│   ├── review/
│   ├── assist/          # AI Assistant (SSE streaming, tool rendering, diff review)
│   ├── stats/           # Token usage analytics
│   └── ...
├── client/              # Auto-generated API client (hey-api — never edited manually)
└── lib/                 # API config, routes, shared utilities
```

### AI Architecture

```
User ──► LLMClient (ABC)
              ├── AnthropicClient (Claude Haiku 4.5)
              └── OpenAIClient (GPT-4o-mini)

Per-user encrypted API keys (Fernet) ──► get_user_llm_client(user)

Features 1–6:  complete()           → single structured response
Feature 7:     stream_with_tools()  → SSE streaming + multi-round tool loop
Feature 8:     embed()              → OpenAI text-embedding-3-small (system key)
```

Each AI feature follows the `*_service.py` + `*_prompts.py` pattern. The shared `LLMClient` ABC in `services/llm.py` handles provider abstraction, error classification, and token tracking.

### Data Model

```
User
 ├── Test
 │    ├── Question (Simple, MC, or Long Text — type-specific JSONB content)
 │    └── QuestionGroup
 │         └── Question (grouped — Simple only)
 ├── Note
 │    └── NoteChunk (pgvector embeddings for RAG)
 └── TokenUsage (per-call metering)
```

## Getting Started

### Prerequisites

- Docker & Docker Compose
- Node.js 18+

### Quick Start

```bash
git clone https://github.com/PepeM112/smart-tutor.git
cd smart-tutor

# Create backend .env (fill in DATABASE_URL, JWT_SECRET)
cp backend/.env.example backend/.env

# Start services
make build

# Seed with sample data (creates test user: reviewer@test.com / Test1234!)
make seed
```

### AI Setup (Optional)

To enable AI features, add API keys to `backend/.env`:

```env
# At least one of these — or configure per-user in Settings
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

### Useful Commands

```bash
make up                  # Start all services
make test                # Run backend + frontend tests
make lint                # Check linting (Ruff + ESLint + Stylelint)
make frontend-gen        # Regenerate TypeScript API client from OpenAPI schema
make seed                # Seed database with sample data
make migrate-upgrade     # Apply pending database migrations
```

## Documentation

Detailed documentation lives in [`docs/`](docs/):

| Document | Covers |
|----------|--------|
| [Content Model](docs/content-model.md) | Tests, questions, question types, content shapes |
| [Answer Grading](docs/answer-grading.md) | Levenshtein matching, typo tolerance, AI grading |
| [Exams](docs/exams.md) | Exam flow, weighted scoring, results |
| [Review & SRS](docs/review-and-srs.md) | Spaced repetition, SM-2, review sessions |
| [Authentication](docs/authentication.md) | JWT flow, HTTP-only cookies |
| [Architecture Decisions](docs/decisions.md) | Key technical choices and rationale |
| [Study Notes](docs/study-notes.md) | Note entity, AI generation, Markdown editor |
| [AI Features](docs/ai-features.md) | LLM architecture, provider pattern, RAG, async operations |
| [AI Test Generation](docs/test-generation.md) | Generating tests from notes, preferences, preview |
| [AI Assistant](docs/ai-assistant.md) | Chat panel, SSE protocol, agentic tool-calling, streaming pipeline |
| [Token Usage & Cost Tracking](docs/token-usage.md) | Token metering, model pricing, cost calculation |

## License

This project is not currently licensed for public use. All rights reserved.

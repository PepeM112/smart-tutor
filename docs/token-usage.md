# Token Usage & Cost Tracking

## Overview

Every AI call in SmartTutor is metered. The system records how many tokens each operation consumed, which provider and model were used, and what the estimated cost was. Users see this data on the Dashboard.

## What Gets Tracked

Each AI call creates one `token_usage` row with:

| Field            | Description                                                     |
| ---------------- | --------------------------------------------------------------- |
| `provider`       | `ANTHROPIC` or `OPENAI`                                         |
| `model`          | SDK model ID (e.g., `claude-haiku-4-5-20251001`, `gpt-4o-mini`) |
| `feature`        | Which AI feature triggered the call (see table below)           |
| `input_tokens`   | Tokens sent to the model (prompt + system message)              |
| `output_tokens`  | Tokens received from the model (completion)                     |
| `estimated_cost` | Dollar cost calculated from model pricing (nullable)            |
| `space_id`       | The classroom (or classroom course) that the call belongs to (nullable, `SET NULL`) |
| `key_source`     | Which key paid: `STUDENT` = 1 (own key, default), `CLASS` = 2 (the Class key of a classroom) |

### Tracked Features

| Feature           | Enum Value | Triggered By                                 |
| ----------------- | ---------- | -------------------------------------------- |
| `GRADING`         | 1          | AI grading a Long Text answer                |
| `CHALLENGE`       | 2          | Re-evaluating a challenged grading criterion |
| `NOTE_GENERATION` | 3          | Generating a study note from a topic         |
| `NOTE_REFINEMENT` | 4          | Refining an existing note with AI            |
| `NOTE_CHUNK_EDIT` | 5          | Editing a selected text chunk in a note      |
| `TEST_GENERATION` | 6          | Generating or editing test questions         |
| `ASSIST`          | 7          | A turn of the AI Assistant chat (see [AI Assistant](ai-assistant.md)) |

## How Recording Works

1. Every `LLMClient.complete()` call returns a `CompletionResult` dataclass containing the response text, token counts, provider name, and model ID.
2. The calling service (grading, notes, test generation) passes `CompletionResult` to `token_usage_service.record_usage()`.
3. `record_usage()` looks up the active model price and calculates the estimated cost before persisting the row. It also stores `space_id` and `key_source`. `llm_key_service.resolve_llm` gives both: the `CompletionResult` is tagged with `ResolvedLLM.tag()` (see [Spaces — Class key](spaces.md#class-key-r36-to-r39)).

Token recording is decoupled from the LLM client — the client only returns usage data, and each service decides when and how to persist it. This keeps the LLM module database-agnostic.

## Cost Calculation

### Model Pricing

The `model_pricing` table stores per-token prices for each model:

| Field          | Description                                            |
| -------------- | ------------------------------------------------------ |
| `model_id`     | OpenRouter format (e.g., `anthropic/claude-haiku-4.5`) |
| `input_price`  | Price per input token in USD (`Numeric(18, 12)`)       |
| `output_price` | Price per output token in USD (`Numeric(18, 12)`)      |
| `valid_from`   | Start date for this price                              |
| `valid_to`     | End date (`NULL` = current price)                      |

Prices come from the OpenRouter public API (`GET https://openrouter.ai/api/v1/models`), which maintains up-to-date pricing for both Anthropic and OpenAI models.

### Model ID Mapping

The SDK model IDs used in our code differ from OpenRouter's model IDs. A mapping dict in `core/model_registry.py` translates between them:

```
claude-haiku-4-5-20251001  →  anthropic/claude-haiku-4.5
gpt-4o-mini                →  openai/gpt-4o-mini
```

### Cost Formula

```
estimated_cost = (input_tokens × input_price) + (output_tokens × output_price)
```

Costs are stored as `Numeric(12, 10)` in the database and serialized as strings in the API response to avoid JavaScript floating-point precision loss.

### Fetching Prices

Prices are fetched manually via `make fetch-prices`. This calls the OpenRouter API, filters to our models, and upserts rows into `model_pricing`. If a price hasn't changed, no new row is created. If a price changes, the old row gets a `valid_to` date and a new row is inserted.

There is no automatic price fetching on startup. A daily cron can be added in the future if needed.

## Dashboard Display

The Dashboard shows token usage data with:

- **Time-range selector** — segmented control with presets: 1D, 1W, 1M (default), 3M, 1Y
- **Stat cards** — total tokens, input tokens, output tokens, estimated cost
- **Stacked bar chart** — daily token consumption by provider (Anthropic in orange, OpenAI in gray)
- **Cumulative line** — running total across the selected period
- **Interactive legend** — click a provider to show/hide its data

### API Endpoint

`GET /api/v1/token-usage?days=N` returns:

```json
{
  "daily": [
    {
      "date": "2026-07-25",
      "provider": 1,
      "inputTokens": 19600,
      "outputTokens": 13900,
      "estimatedCost": "0.0893000000"
    }
  ],
  "totalInputTokens": 174654,
  "totalOutputTokens": 187373,
  "totalEstimatedCost": "0.7627882000"
}
```

The `days` parameter accepts 1–365 (default 30).

## Classroom Spend

A classroom can have a Class key (see [Spaces — Class key](spaces.md#class-key-r36-to-r39)). The owner sees what each student used.

- **`space_id`** is set when the call is made for a classroom or one of its courses (grading and challenge of a classroom test, Assistant requests with a `space_id`). A Class-key call is always booked on the classroom that pays, also a personal call (scope `ALL`). A student-key call is booked on a space only when the user is a member of it. When the space is deleted, `space_id` becomes NULL.
- **`key_source`** says who paid. The monthly cap counts only `CLASS` rows. Rows from before ST-68 are `STUDENT`.
- **Cap rule:** the sum of `CLASS` tokens (input + output) of one student, in the classroom and its courses, in the current UTC calendar month. At or above `monthly_token_cap_per_student`, the student key is used, or the call is blocked when the student has no key.
- **Endpoint:** `GET /api/v1/classrooms/{id}/token-usage` (owner only) returns `monthStart` and one row per student: `monthTokens`, `monthCost`, `totalTokens`, `totalCost`, `isActive` and `bySource` (one entry per `keySource`). A cost is null when no row has a price. A student who left stays in the list with `isActive = false`. The Settings tab shows it in `ClassSpendTable`.
- `GET /api/v1/classrooms/{id}/ai-key-status` (any member) returns the key that the user would use, and the cap numbers of the user.
- The personal Dashboard (`GET /token-usage`) counts all rows of the user, whatever `key_source` is.

## Management Commands

| Command               | Description                                               |
| --------------------- | --------------------------------------------------------- |
| `make fetch-prices`   | Fetch current model prices from OpenRouter                |
| `make backfill-costs` | Calculate `estimated_cost` for rows that have `NULL` cost |

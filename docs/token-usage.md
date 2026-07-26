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

### Tracked Features

| Feature           | Enum Value | Triggered By                                 |
| ----------------- | ---------- | -------------------------------------------- |
| `GRADING`         | 1          | AI grading a Long Text answer                |
| `CHALLENGE`       | 2          | Re-evaluating a challenged grading criterion |
| `NOTE_GENERATION` | 3          | Generating a study note from a topic         |
| `NOTE_REFINEMENT` | 4          | Refining an existing note with AI            |
| `NOTE_CHUNK_EDIT` | 5          | Editing a selected text chunk in a note      |
| `TEST_GENERATION` | 6          | Generating or editing test questions         |

## How Recording Works

1. Every `LLMClient.complete()` call returns a `CompletionResult` dataclass containing the response text, token counts, provider name, and model ID.
2. The calling service (grading, notes, test generation) passes `CompletionResult` to `token_usage_service.record_usage()`.
3. `record_usage()` looks up the active model price and calculates the estimated cost before persisting the row.

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

## Management Commands

| Command               | Description                                               |
| --------------------- | --------------------------------------------------------- |
| `make fetch-prices`   | Fetch current model prices from OpenRouter                |
| `make backfill-costs` | Calculate `estimated_cost` for rows that have `NULL` cost |

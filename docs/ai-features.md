# AI Features

## Overview

SmartTutor uses AI for seven capabilities:

1. **Long Text grading** — evaluating paragraph-style answers against rubric criteria (see [Answer Grading](answer-grading.md#long-text-questions-ai-grading))
2. **Challenge re-evaluation** — re-assessing disputed grading results (see [Answer Grading](answer-grading.md#challenge--re-evaluation))
3. **Study note generation** — creating Markdown study material from a topic (see [Study Notes](study-notes.md#ai-note-generation))
4. **Test generation** — creating questions from study notes (see [AI Test Generation](test-generation.md))
5. **Note chunk editing** — user selects text inside a note's preview, gives an instruction, and the AI rewrites only that selection
6. **Test question editing** — user selects one or more questions (in the test editor or in a generated test preview), gives an instruction, and the AI edits them. Unlike automatic test generation, this can also produce Long Text questions.
7. **AI Assistant** — a chat panel, present on every page, that can answer questions about the user's content, navigate the app, and create or edit notes/tests through an agentic tool-calling loop (see [AI Assistant](ai-assistant.md))

The first six all share the same request/response shape: call `complete_for_user`, get a single structured result back. The Assistant is different — a chat turn streams incrementally and can involve multiple rounds of tool calls, so it uses `stream_with_tools()` instead of `complete()` on the same underlying `LLMClient`. It still shares everything else described below: provider setup, per-user keys, and token usage tracking. See [AI Assistant](ai-assistant.md) for its protocol, tools, and streaming architecture in full.

## Provider Architecture

Each user configures their own AI provider and API key in **Settings**. There is no global provider setting — the provider used for a given AI call depends on who is making it, not on server configuration.

### Setup

In Settings, a user:

1. Picks a preferred provider — Anthropic or OpenAI.
2. Pastes an API key for that provider. A key for the other provider can also be stored, but only the preferred provider's key is used for AI calls.

| Provider  | Model            |
| --------- | ---------------- |
| Anthropic | Claude Haiku 4.5 |
| OpenAI    | GPT-4o-mini      |

### Key storage

API keys are encrypted at rest using Fernet symmetric encryption (`services/encryption.py`). The encryption key comes from the `ENCRYPTION_KEY` environment variable. A key is decrypted only at call time, inside `get_user_llm_client`.

### Call flow

Every user-facing AI feature calls `complete_for_user`:

```python
result = complete_for_user(
    user=current_user,
    system=SYSTEM_PROMPT,
    user_prompt=user_prompt,
    max_tokens=max_tokens,
)
```

`complete_for_user` does two things:

1. Calls `get_user_llm_client(user)`, which builds an LLM client using the user's decrypted key and preferred provider.
2. Sends the request and returns a `CompletionResult` (see [Token Usage Tracking](#token-usage-tracking)).

If the user has no API key configured for their preferred provider, the call fails immediately with:

```
403 — AI is not configured. Please add your API key in Settings.
```

### System-level fallback

`get_llm_client()` and `complete()` still exist. They read `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and `AI_GRADING_PROVIDER` from the environment. They are kept only for system-level operations that are not tied to a specific user — for example, an ops script. No user-facing feature calls them.

## Prompt Design

Each AI feature has its own prompt tailored to its task (grading a rubric, drafting a note, editing a chunk, generating or editing questions), but all of them are designed to return **structured, parseable output** rather than free-form prose. This lets the backend validate what the AI returns — checking that a rubric verdict is boolean, that a generated question has the right shape, that a note's length roughly matches what was requested, that an edited note chunk contains only replacement text — instead of trusting the AI's output blindly.

- Note chunk editing uses `NOTE_CHUNK_EDIT_SYSTEM_PROMPT` (`services/note_prompts.py`). It instructs the AI to return only the replacement text for the selected section, preserving the surrounding document's Markdown style.
- Test question editing reuses `TEST_GENERATION_SYSTEM_PROMPT` with a dedicated user-prompt builder, `build_question_edit_user_prompt` (`services/test_generation_prompts.py`), which lists the full question set and marks which indices are selected for editing.

## Token Usage Tracking

Every AI call returns a `CompletionResult`:

| Field           | Type | Description                     |
| --------------- | ---- | -------------------------------- |
| `text`          | str  | Raw model output                 |
| `input_tokens`  | int  | Tokens consumed by the prompt    |
| `output_tokens` | int  | Tokens consumed by the completion |
| `provider`      | str  | `"anthropic"` or `"openai"`      |
| `model`         | str  | Exact model ID used              |

After each call, the calling service passes the result to `token_usage_service.record_usage()`:

```python
token_usage_service.record_usage(
    db, user_id=current_user.id, result=result, feature=AIFeature.NOTE_GENERATION
)
```

This inserts a row into the `token_usage` table (`user_id`, `provider`, `model`, `feature`, `input_tokens`, `output_tokens`, `estimated_cost`) so every AI call is attributable to a user and a feature.

### Cost calculation

`pricing_service.calculate_cost()` looks up the model's current price in the `model_pricing` table and applies it to the token counts:

```
cost = input_price × input_tokens + output_price × output_tokens
```

Prices are sourced from OpenRouter's public models API and kept in sync by `pricing_service.fetch_and_update_prices()`, which maps our model IDs to OpenRouter's IDs via `SDK_TO_OPENROUTER` (`app/core/model_registry.py`). If a model has no matching price row, `estimated_cost` is stored as `null` rather than a guessed value.

### Precision

`estimated_cost` is a `Numeric(12, 10)` column, which keeps sub-cent per-call costs exact. Costs are sent to the frontend as strings, not numbers — parsing a `Numeric` into a JavaScript `number` risks float precision loss, so the frontend receives the exact decimal string and formats it for display without doing arithmetic on it.

### Dashboard

Users see their usage on the Dashboard:

- **Stat cards** — total tokens, input tokens, output tokens, estimated cost.
- **Chart** — a stacked bar chart of daily token usage, one color per provider, with a cumulative-total line overlaid.
- **Time range filter** — 1D, 1W, 1M, 3M, or 1Y.

## Synchronous vs Asynchronous Features

AI calls take anywhere from one to several seconds. Whether a feature waits for the result or hands it off in the background depends on what the user is doing at that moment:

| Feature                 | Pattern      | Why                                                                                  |
| ------------------------ | ------------ | -------------------------------------------------------------------------------------- |
| Long Text grading        | Asynchronous | Happens after exam submission; the user has moved on and shouldn't wait on a spinner  |
| Challenge re-evaluation  | Asynchronous | Same reasoning — the user submits a challenge and continues browsing                  |
| Study note generation    | Synchronous  | The user is actively waiting on a loading screen for the result                       |
| Test generation          | Synchronous  | Same — the user watches a preview populate                                            |
| Note chunk editing       | Synchronous  | The user is watching the selected text and waits for the rewritten version            |
| Test question editing    | Synchronous  | Same — the user watches the selected questions update in the editor or preview        |

**Asynchronous flow:** the record is created immediately in a pending state, and the AI call happens afterward. The user's screen polls periodically until the pending state clears and the real result appears.

**Synchronous flow:** the request blocks until the AI responds, and the result (or an error) comes back in that same response.

## Error Handling

AI operations can fail for a few distinct reasons, and the system treats them differently depending on whether the call was synchronous or asynchronous:

| Category   | Cause                                                   | Result                                                                       |
| ---------- | -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| No API key | The user has not configured a key for their preferred provider | `403` — "AI is not configured. Please add your API key in Settings."          |
| Provider   | Rate limiting, outage, or other API error                | `502` — treated as a temporary failure, safe to retry                         |
| Parsing    | AI response doesn't match expected structure             | `502` — rejected and reported as invalid                                      |
| System config | The environment-based fallback (`get_llm_client`) has no provider configured — system-level calls only | `503` — reported as unavailable                    |

For asynchronous features (grading, challenges), a failure moves the record to a terminal "failed" state instead of leaving it stuck pending forever — the user sees that grading didn't succeed rather than waiting indefinitely. For synchronous features (notes, test generation, chunk editing, question editing), the failure surfaces immediately as an error the user can retry.

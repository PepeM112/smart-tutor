# AI Features

## Overview

SmartTutor uses AI for four capabilities:

1. **Long Text grading** — evaluating paragraph-style answers against rubric criteria (see [Answer Grading](answer-grading.md#long-text-questions-ai-grading))
2. **Challenge re-evaluation** — re-assessing disputed grading results (see [Answer Grading](answer-grading.md#challenge--re-evaluation))
3. **Study note generation** — creating Markdown study material from a topic (see [Study Notes](study-notes.md#ai-note-generation))
4. **Test generation** — creating questions from study notes (see [AI Test Generation](test-generation.md))

All four share the same underlying provider setup and error-handling model, described below.

## Provider Architecture

Every AI feature goes through the same LLM abstraction, so any of the four capabilities can run on either supported provider:

| Provider  | Model            | Default? |
| --------- | ---------------- | -------- |
| Anthropic | Claude Haiku 4.5  | Yes      |
| OpenAI    | GPT-4o-mini      | No       |

The active provider is a single global setting, not a per-feature choice — switching providers changes how grading, note generation, and test generation all behave at once. Both providers expose the same behavior to the rest of the app, so the choice of provider is an operational decision, not a feature-level one.

If the provider's API key is missing or misconfigured, AI features become unavailable and requests fail with a clear "AI unavailable" error rather than a generic failure.

## Prompt Design

Each AI feature has its own prompt tailored to its task (grading a rubric, drafting a note, generating questions), but all of them are designed to return **structured, parseable output** rather than free-form prose. This lets the backend validate what the AI returns — checking that a rubric verdict is boolean, that a generated question has the right shape, that a note's length roughly matches what was requested — instead of trusting the AI's output blindly.

## Synchronous vs Asynchronous Features

AI calls take anywhere from one to several seconds. Whether a feature waits for the result or hands it off in the background depends on what the user is doing at that moment:

| Feature                  | Pattern      | Why                                                                 |
| ------------------------- | ------------ | -------------------------------------------------------------------- |
| Long Text grading          | Asynchronous | Happens after exam submission; the user has moved on and shouldn't wait on a spinner |
| Challenge re-evaluation    | Asynchronous | Same reasoning — the user submits a challenge and continues browsing |
| Study note generation      | Synchronous  | The user is actively waiting on a loading screen for the result      |
| Test generation            | Synchronous  | Same — the user watches a preview populate                           |

**Asynchronous flow:** the record is created immediately in a pending state, and the AI call happens afterward. The user's screen polls periodically until the pending state clears and the real result appears.

**Synchronous flow:** the request blocks until the AI responds, and the result (or an error) comes back in that same response.

## Error Handling

AI operations can fail for a few distinct reasons, and the system treats them differently depending on whether the call was synchronous or asynchronous:

| Category | Cause                                    | Result                                              |
| -------- | ----------------------------------------- | ---------------------------------------------------- |
| Auth     | Missing or invalid API key                 | AI features reported as unavailable                   |
| Provider | Rate limiting, outage, or other API error  | Treated as a temporary failure                        |
| Parsing  | AI response doesn't match expected structure | Rejected and reported as invalid                     |
| Config   | No provider configured at all              | AI features reported as unavailable                   |

For asynchronous features (grading, challenges), a failure moves the record to a terminal "failed" state instead of leaving it stuck pending forever — the user sees that grading didn't succeed rather than waiting indefinitely. For synchronous features (notes, test generation), the failure surfaces immediately as an error the user can retry.

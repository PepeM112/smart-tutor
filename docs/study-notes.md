# Study Notes

## What Notes Are

A note is a standalone Markdown document used for study material — reading and reference, not assessment. Notes exist outside the Test/Question hierarchy: a user might write a note summarizing a grammar topic, or generate one on a historical period, without ever turning it into a test.

Notes serve two purposes:

1. **Reference material** — something to read and revisit.
2. **Source material for test generation** — a note's content can be handed to the AI to produce a set of questions (see [AI Test Generation](test-generation.md)).

## The Note Entity

| Field         | Description                                                        |
| ------------- | -------------------------------------------------------------------- |
| `title`       | Short name, up to 200 characters                                     |
| `description` | Optional one-line summary, up to 500 characters                      |
| `content`     | The note body, in Markdown                                           |
| `source`      | `USER_CREATED` or `AI_GENERATED`                                     |
| `tags`        | Free-form labels for organization                                    |

Notes track when they were created and when they were last edited.

## Creating Notes Manually

Users write in a split-panel editor: raw Markdown on one side, a live preview on the other. Standard Markdown is supported, along with GitHub Flavored Markdown extensions — tables, task lists, strikethrough, and similar formatting.

## Importing Notes

An existing `.md` file can be imported directly. Its contents load into the editor so the user can review, adjust, and save it like any other note.

## AI Note Generation

Instead of writing from scratch, a user can ask the AI to draft a note. The request includes:

- A **topic** (required)
- Optional **guidance** — focus areas, or things to include or exclude
- A **length** preference: short, medium, or long

The AI produces structured Markdown content covering the topic. The result opens in the editor for review — nothing is saved until the user confirms. Notes created this way are tagged `AI_GENERATED` so their origin stays visible.

## AI Note Refinement

Once a note exists — whether written by hand or generated — the user can ask the AI to revise it. Rather than filling out a form again, the user describes the change in free text (e.g. "shorten the introduction," "add a section on exceptions," "make the tone more casual"). The AI returns an updated version of the content, which the user reviews before saving.

Refinement operates on the note as a whole; it does not require regenerating from the original topic.

## Tags

Tags are free-form strings attached to a note for organization — there is no fixed taxonomy. A user might tag notes by subject ("spanish", "grammar") or by purpose ("exam-prep"). Tags can be added or removed at any time from the editor.

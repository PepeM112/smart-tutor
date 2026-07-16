from app.core.enums import NoteLength

NOTE_GENERATION_SYSTEM_PROMPT = (
    "You are a study-notes generator. You produce well-structured Markdown notes "
    "for a given topic. Use headings (##, ###), bullet points, bold for key terms, "
    "and tables where appropriate. Include examples and mnemonics when they help. "
    "Output ONLY the Markdown content — no preamble, no closing remarks, no code fences "
    "wrapping the entire output."
)

_LENGTH_GUIDANCE: dict[int, str] = {
    NoteLength.SHORT: "Keep the notes concise — roughly 300-500 words.",
    NoteLength.MEDIUM: "Produce moderately detailed notes — roughly 800-1500 words.",
    NoteLength.LONG: "Produce comprehensive, in-depth notes — roughly 2000-3500 words.",
}


def build_note_generation_user_prompt(
    topic: str,
    guidance: str | None = None,
    length: NoteLength | None = None,
) -> str:
    parts = [f"## Topic\n{topic}"]

    if guidance:
        parts.append(f"## Additional Guidance\n{guidance}")

    length_hint = _LENGTH_GUIDANCE.get(int(length), "") if length else ""
    if length_hint:
        parts.append(f"## Length\n{length_hint}")

    return "\n\n".join(parts)


NOTE_REFINEMENT_SYSTEM_PROMPT = (
    "You are a study-notes editor. You receive existing Markdown study notes and "
    "user instructions for how to improve them. Return the COMPLETE updated Markdown — "
    "keep unchanged sections as-is, modify what the user asks, and add new content "
    "if requested. Output ONLY the Markdown content — no preamble, no closing remarks, "
    "no code fences wrapping the entire output."
)


def build_note_refinement_user_prompt(
    current_content: str,
    instructions: str,
) -> str:
    return (
        f"## Current Notes\n{current_content}\n\n"
        f"## Instructions\n{instructions}\n\n"
        f"Return the full updated notes as Markdown."
    )

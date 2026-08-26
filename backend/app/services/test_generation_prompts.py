from app.core.enums import QuestionType

TEST_GENERATION_SYSTEM_PROMPT = """\
You are a test question generator for an educational platform. Your job is to \
create practice questions from study notes.

You MUST respond with ONLY a valid JSON object — no markdown fences, no \
preamble, no explanation. The JSON must match this exact structure:

{
  "questions": [
    {
      "type": "SIMPLE",
      "prompt": "The question text",
      "points": 1.0,
      "content": {
        "answers": ["answer1", "answer2"]
      }
    },
    {
      "type": "MULTIPLE_CHOICE",
      "prompt": "The question text",
      "points": 1.0,
      "content": {
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correctIndices": [0, 2]
      }
    },
    {
      "type": "LONG_TEXT",
      "prompt": "The question text",
      "points": 2.0,
      "content": {
        "lengthLimit": 2,
        "rubric": [
          {"point": "Concept description", "weight": 0.5, "category": "Key Concepts"},
          {"point": "Another criterion", "weight": 0.3, "category": null},
          {"point": "Third criterion", "weight": 0.2, "category": null}
        ]
      }
    }
  ]
}

Rules for each question type:

SIMPLE questions:
- "answers" is a list of all acceptable answers (synonyms, alternate spellings)
- Include at least 1 answer, ideally 2-3 for terms with common alternatives
- Answers should be concise (1-5 words typically)

MULTIPLE_CHOICE questions:
- "options" must have between 2 and 6 items
- "correctIndices" lists the zero-based indices of correct options
- At least one option must be correct
- Distractors (wrong options) should be plausible but clearly wrong
- Avoid "all of the above" or "none of the above" options

LONG_TEXT questions:
- "lengthLimit" is an integer: 1 = SHORT (~500 chars), 2 = MEDIUM (~1800 chars), 3 = LONG (~5000 chars)
- "rubric" is a list of grading criteria, each with a "point" (description), "weight" (0.0-1.0), and optional "category"
- Rubric weights must sum to approximately 1.0 (between 0.95 and 1.05)
- Each rubric item's weight must be a multiple of 0.05
- Include at least 2 rubric items
- Use "category" to group related criteria when the question covers multiple aspects
- Points should be higher for LONG_TEXT (typically 2.0-5.0) since they require more effort

General rules:
- Every question must have a non-empty "prompt"
- Set "points" to 1.0 for SIMPLE and MULTIPLE_CHOICE questions. For LONG_TEXT, use 2.0-5.0
- No duplicate questions (same prompt text)
- Questions must be directly answerable from the provided study material
- Do not invent facts not present in the notes\
"""

_DIFFICULTY_GUIDANCE: dict[str, str] = {
    "easy": (
        "Generate straightforward recall questions. For SIMPLE questions, use "
        "direct definitions and factual lookups. For MULTIPLE_CHOICE, use "
        "clearly wrong distractors that are easy to eliminate. For LONG_TEXT "
        "questions, use straightforward rubric criteria that test basic "
        "knowledge recall."
    ),
    "medium": (
        "Generate questions that require understanding, not just recall. For "
        "SIMPLE questions, ask about relationships and applications. For "
        "MULTIPLE_CHOICE, use plausible distractors that require careful thought. "
        "For LONG_TEXT questions, use criteria that require demonstrating "
        "understanding and connecting concepts."
    ),
    "hard": (
        "Generate challenging questions that test deep comprehension. For "
        "SIMPLE questions, ask about nuances, exceptions, and implications. "
        "For MULTIPLE_CHOICE, use very plausible distractors, multi-correct "
        "options, and questions that combine multiple concepts. For LONG_TEXT "
        "questions, use criteria that demand synthesis, critical analysis, and "
        "nuanced understanding."
    ),
}

_TYPE_NAMES: dict[QuestionType, str] = {
    QuestionType.SIMPLE: "SIMPLE",
    QuestionType.MULTIPLE_CHOICE: "MULTIPLE_CHOICE",
    QuestionType.LONG_TEXT: "LONG_TEXT",
}


def build_test_generation_user_prompt(
    note_content: str,
    question_count: int,
    question_types: list[QuestionType],
    difficulty: str,
    guidance: str | None = None,
) -> str:
    type_names = [_TYPE_NAMES[t] for t in question_types if t in _TYPE_NAMES]
    types_str = ", ".join(type_names)

    parts = [
        f"## Study Material\n{note_content}",
        f"## Requirements\n"
        f"- Generate exactly {question_count} questions\n"
        f"- Question types to use: {types_str}\n"
        f"- Distribute questions roughly evenly across the requested types",
        f"## Difficulty\n{_DIFFICULTY_GUIDANCE.get(difficulty, _DIFFICULTY_GUIDANCE['medium'])}",
    ]

    if guidance:
        parts.append(f"## Additional Guidance\n{guidance}")

    return "\n\n".join(parts)


def build_retry_user_prompt(original_prompt: str, validation_errors: list[str]) -> str:
    errors_str = "\n".join(f"- {e}" for e in validation_errors)
    return (
        f"{original_prompt}\n\n"
        f"## IMPORTANT — Previous Attempt Failed Validation\n"
        f"Your previous response had the following errors:\n{errors_str}\n\n"
        f"Please fix these errors and return a valid JSON response."
    )


def build_refinement_user_prompt(
    note_content: str,
    current_questions_json: str,
    instructions: str,
) -> str:
    return (
        f"## Study Material\n{note_content}\n\n"
        f"## Current Questions\n"
        f"The user has already generated the following questions. "
        f"Return a COMPLETE updated set — keep unchanged questions as-is, "
        f"modify the ones the user wants changed, and add any new ones requested.\n\n"
        f"{current_questions_json}\n\n"
        f"## User Instructions\n{instructions}\n\n"
        f"Return the full updated question set as valid JSON in the same format."
    )


def build_question_edit_user_prompt(
    all_questions_json: str,
    selected_indices: list[int],
    instructions: str,
    note_content: str | None = None,
) -> str:
    selected_str = ", ".join(str(i + 1) for i in selected_indices)
    parts = []

    if note_content:
        parts.append(f"## Study Material (for context)\n{note_content}")

    parts.append(
        f"CRITICAL: You MUST return non-selected questions byte-for-byte identical — "
        f"same prompt text, same options, same correct indices, same everything. Do NOT "
        f"rephrase, reword, or 'improve' unselected questions. Only touch the specified "
        f"question(s) ({selected_str})."
    )

    parts.append(
        f"## Current Questions\n"
        f"The following is the complete question set. The user wants to edit "
        f"question(s) {selected_str} (1-indexed) based on their instructions below.\n\n"
        f"{all_questions_json}"
    )

    parts.append(
        f"## User Instructions\n{instructions}\n\n"
        f"Apply the user's instructions ONLY to the specified question(s). "
        f"Return the COMPLETE updated question set as valid JSON in the same format — "
        f"keep non-selected questions exactly as they are.\n\n"
        f"REMINDER — CRITICAL: Non-selected questions MUST be returned byte-for-byte "
        f"identical to the input (same prompt text, same options, same correct indices, "
        f"same everything). Do NOT rephrase, reword, or 'improve' unselected questions. "
        f"Only question(s) {selected_str} may be changed."
    )

    return "\n\n".join(parts)

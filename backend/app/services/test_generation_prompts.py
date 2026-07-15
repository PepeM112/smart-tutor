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

General rules:
- Every question must have a non-empty "prompt"
- Set "points" to 1.0 for all questions
- No duplicate questions (same prompt text)
- Questions must be directly answerable from the provided study material
- Do not invent facts not present in the notes\
"""

_DIFFICULTY_GUIDANCE: dict[str, str] = {
    "easy": (
        "Generate straightforward recall questions. For SIMPLE questions, use "
        "direct definitions and factual lookups. For MULTIPLE_CHOICE, use "
        "clearly wrong distractors that are easy to eliminate."
    ),
    "medium": (
        "Generate questions that require understanding, not just recall. For "
        "SIMPLE questions, ask about relationships and applications. For "
        "MULTIPLE_CHOICE, use plausible distractors that require careful thought."
    ),
    "hard": (
        "Generate challenging questions that test deep comprehension. For "
        "SIMPLE questions, ask about nuances, exceptions, and implications. "
        "For MULTIPLE_CHOICE, use very plausible distractors, multi-correct "
        "options, and questions that combine multiple concepts."
    ),
}

_TYPE_NAMES: dict[QuestionType, str] = {
    QuestionType.SIMPLE: "SIMPLE",
    QuestionType.MULTIPLE_CHOICE: "MULTIPLE_CHOICE",
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

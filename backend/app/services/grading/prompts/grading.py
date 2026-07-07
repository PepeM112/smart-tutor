import json
import re

from app.schemas.question import RubricItem

GRADING_SYSTEM_PROMPT = (
    "You are an exam grader. You receive a question, a rubric of criteria, "
    "and a student's answer. For each criterion, decide whether the answer meets it "
    "and provide a brief justification. "
    'Respond ONLY with a JSON object: {"results": [...]}, where each element has '
    '"index" (int, zero-based), "met" (bool), and "reason" (string — one sentence '
    "explaining why the criterion was or was not met, referencing what the student "
    "wrote or omitted). "
    "Do not include any other text."
)

_CODE_FENCE_RE = re.compile(r"^```(?:json)?\s*\n?(.*?)\n?\s*```$", re.DOTALL)


def strip_code_fences(text: str) -> str:
    """Strip markdown code fences that LLMs sometimes wrap JSON in."""
    match = _CODE_FENCE_RE.match(text.strip())
    return match.group(1).strip() if match else text.strip()


def build_grading_user_prompt(prompt: str, rubric: list[RubricItem], answer: str) -> str:
    criteria = [{"index": i, "point": item.point} for i, item in enumerate(rubric)]
    return f"## Question\n{prompt}\n\n## Rubric\n{json.dumps(criteria)}\n\n## Student Answer\n{answer}"

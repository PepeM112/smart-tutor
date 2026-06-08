import json

from app.schemas.question import RubricItem

SYSTEM_PROMPT = (
    "You are an exam grader. You receive a question, a rubric of criteria, "
    "and a student's answer. For each criterion, decide whether the answer meets it. "
    'Respond ONLY with a JSON object: {"results": [...]}, where each element has '
    '"index" (int, zero-based) and "met" (bool). '
    "Do not include any other text."
)


def build_user_prompt(prompt: str, rubric: list[RubricItem], answer: str) -> str:
    criteria = [{"index": i, "point": item.point} for i, item in enumerate(rubric)]
    return f"## Question\n{prompt}\n\n## Rubric\n{json.dumps(criteria)}\n\n## Student Answer\n{answer}"

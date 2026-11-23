import json
import re

from pydantic import JsonValue

from app.schemas.question import RubricItem
from app.services.content_format_prompts import FEEDBACK_FORMAT_PROMPT

GRADING_SYSTEM_PROMPT = (
    "You are an exam grader. You receive a question, a rubric of criteria, "
    "and a student's answer. For each criterion, decide whether the answer meets it "
    "and provide a brief justification. "
    'Respond ONLY with a JSON object: {"results": [...]}, where each element has '
    '"index" (int, zero-based), "met" (bool), and "reason" (string — one sentence '
    "explaining why the criterion was or was not met, referencing what the student "
    "wrote or omitted). "
    f"{FEEDBACK_FORMAT_PROMPT} "
    "Do not include any other text."
)

_CODE_FENCE_RE = re.compile(r"^```(?:json)?\s*\n?(.*?)\n?\s*```$", re.DOTALL)


def strip_code_fences(text: str) -> str:
    """Strip markdown code fences that LLMs sometimes wrap JSON in."""
    match = _CODE_FENCE_RE.match(text.strip())
    return match.group(1).strip() if match else text.strip()


# Keeps valid JSON escapes; any other backslash is a lone LaTeX one and gets doubled.
# \b and \f followed by a letter are LaTeX (\beta, \frac): real text never has a backspace or form feed.
# \n, \t and \r stay as JSON escapes: they are ambiguous with \nabla, \times, \rho.
_JSON_ESCAPE_RE = re.compile(r'\\(?:\\|u[0-9a-fA-F]{4}|["/nrt]|[bf](?![A-Za-z]))|\\')


def parse_ai_json(raw: str) -> JsonValue:
    """Parse JSON from an LLM reply, tolerating code fences and single-backslash LaTeX in strings."""
    fixed = _JSON_ESCAPE_RE.sub(lambda m: m.group(0) if len(m.group(0)) > 1 else "\\\\", strip_code_fences(raw))
    return json.loads(fixed)


def build_grading_user_prompt(prompt: str, rubric: list[RubricItem], answer: str) -> str:
    criteria = [{"index": i, "point": item.point} for i, item in enumerate(rubric)]
    return f"## Question\n{prompt}\n\n## Rubric\n{json.dumps(criteria)}\n\n## Student Answer\n{answer}"

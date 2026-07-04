import json
import logging
import os

from openai import OpenAI

from app.schemas.question import RubricItem
from app.services.grading.base import CriterionResult, GradingProvider
from app.services.grading.prompt import SYSTEM_PROMPT, build_user_prompt, strip_code_fences

logger = logging.getLogger("smarttutor.grading.openai")

MODEL = "gpt-4o-mini"


class OpenAIGradingProvider(GradingProvider):
    def __init__(self) -> None:
        api_key = os.getenv("OPENAI_API_KEY", "")
        if not api_key:
            raise ValueError("OPENAI_API_KEY is not set — cannot initialise grading provider")
        self._client = OpenAI(api_key=api_key)

    @property
    def name(self) -> str:
        return f"OpenAI ({MODEL})"

    def grade(
        self,
        prompt: str,
        rubric: list[RubricItem],
        answer: str,
    ) -> list[CriterionResult]:
        user_prompt = build_user_prompt(prompt, rubric, answer)

        response = self._client.chat.completions.create(
            model=MODEL,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
        )

        raw_text = response.choices[0].message.content or '{"results": []}'
        logger.debug("OpenAI raw response: %s", raw_text)

        raw_text = strip_code_fences(raw_text)
        data: dict[str, object] = json.loads(raw_text)
        parsed: list[dict[str, object]] = data["results"]  # type: ignore[assignment]
        return [
            CriterionResult(
                index=int(item["index"]),
                met=bool(item["met"]),
                reason=str(item.get("reason", "")),
            )
            for item in parsed
        ]

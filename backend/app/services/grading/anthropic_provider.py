import json
import logging
import os

from anthropic import Anthropic
from anthropic.types import TextBlock

from app.schemas.question import RubricItem
from app.services.grading.base import CriterionResult, GradingProvider
from app.services.grading.prompt import SYSTEM_PROMPT, build_user_prompt

logger = logging.getLogger("smarttutor.grading.anthropic")

MODEL = "claude-haiku-4-5-20251001"


class AnthropicGradingProvider(GradingProvider):
    def __init__(self) -> None:
        api_key = os.getenv("ANTHROPIC_API_KEY", "")
        self._client = Anthropic(api_key=api_key)

    def grade(
        self,
        prompt: str,
        rubric: list[RubricItem],
        answer: str,
    ) -> list[CriterionResult]:
        user_prompt = build_user_prompt(prompt, rubric, answer)

        response = self._client.messages.create(
            model=MODEL,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )

        block = response.content[0]
        if not isinstance(block, TextBlock):
            raise TypeError(f"Expected TextBlock, got {type(block).__name__}")
        raw_text = block.text
        logger.debug("Anthropic raw response: %s", raw_text)

        data: dict[str, object] = json.loads(raw_text)
        parsed: list[dict[str, object]] = data["results"]  # type: ignore[assignment]
        return [CriterionResult(index=int(item["index"]), met=bool(item["met"])) for item in parsed]

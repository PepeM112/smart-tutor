import logging
import os

from anthropic import Anthropic
from anthropic.types import TextBlock

from app.core.enums import NoteLength
from app.services.ai.base import AIProvider
from app.services.ai.prompts import NOTE_GENERATION_SYSTEM_PROMPT, build_note_generation_user_prompt

logger = logging.getLogger("smarttutor.ai.anthropic")

MODEL = "claude-haiku-4-5-20251001"
MAX_TOKENS = 4096


class AnthropicAIProvider(AIProvider):
    def __init__(self) -> None:
        api_key = os.getenv("ANTHROPIC_API_KEY", "")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY is not set — cannot initialise AI provider")
        self._client = Anthropic(api_key=api_key)

    @property
    def name(self) -> str:
        return f"Anthropic ({MODEL})"

    def generate_notes(
        self,
        topic: str,
        guidance: str | None = None,
        length: NoteLength | None = None,
    ) -> str:
        user_prompt = build_note_generation_user_prompt(topic, guidance, length)

        response = self._client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=NOTE_GENERATION_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )

        if not response.content:
            raise ValueError(
                f"Empty response from Anthropic (stop_reason={response.stop_reason}, usage={response.usage})"
            )

        block = response.content[0]
        if not isinstance(block, TextBlock):
            raise TypeError(f"Expected TextBlock, got {type(block).__name__}")

        text = block.text.strip()
        if not text:
            raise ValueError(
                f"Anthropic returned empty text (stop_reason={response.stop_reason}, usage={response.usage})"
            )

        return text

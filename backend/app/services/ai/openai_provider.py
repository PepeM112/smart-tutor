import logging
import os

from openai import OpenAI

from app.core.enums import NoteLength
from app.services.ai.base import AIProvider
from app.services.ai.prompts import NOTE_GENERATION_SYSTEM_PROMPT, build_note_generation_user_prompt

logger = logging.getLogger("smarttutor.ai.openai")

MODEL = "gpt-4o-mini"
MAX_TOKENS = 4096


class OpenAIAIProvider(AIProvider):
    def __init__(self) -> None:
        api_key = os.getenv("OPENAI_API_KEY", "")
        if not api_key:
            raise ValueError("OPENAI_API_KEY is not set — cannot initialise AI provider")
        self._client = OpenAI(api_key=api_key)

    @property
    def name(self) -> str:
        return f"OpenAI ({MODEL})"

    def generate_notes(
        self,
        topic: str,
        guidance: str | None = None,
        length: NoteLength | None = None,
    ) -> str:
        user_prompt = build_note_generation_user_prompt(topic, guidance, length)

        response = self._client.chat.completions.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            messages=[
                {"role": "system", "content": NOTE_GENERATION_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
        )

        text = response.choices[0].message.content or ""
        text = text.strip()
        if not text:
            raise ValueError("OpenAI returned empty text for note generation")

        return text

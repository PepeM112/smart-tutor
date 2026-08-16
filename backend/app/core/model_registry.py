SDK_TO_OPENROUTER: dict[str, str] = {
    "claude-haiku-4-5-20251001": "anthropic/claude-haiku-4.5",
    "gpt-4o-mini": "openai/gpt-4o-mini",
}

OPENROUTER_TO_SDK: dict[str, str] = {v: k for k, v in SDK_TO_OPENROUTER.items()}

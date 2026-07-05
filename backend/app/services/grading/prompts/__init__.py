from app.services.grading.prompts.grading import (
    GRADING_PROMPT,
    build_grading_user_prompt,
    strip_code_fences,
)

# Backward-compatible aliases
SYSTEM_PROMPT = GRADING_PROMPT
build_user_prompt = build_grading_user_prompt

__all__ = [
    "GRADING_PROMPT",
    "SYSTEM_PROMPT",
    "build_grading_user_prompt",
    "build_user_prompt",
    "strip_code_fences",
]

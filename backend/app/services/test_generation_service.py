import json
import logging

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.enums import QuestionType
from app.models.user import User
from app.schemas.question import MultipleChoiceContent, SimpleContent
from app.schemas.test_generation import (
    GeneratedQuestionPreview,
    TestGenerationRequest,
    TestGenerationResponse,
    TestRefinementRequest,
)
from app.services.grading.prompts.grading import strip_code_fences
from app.services.llm import complete
from app.services.note_service import get_note
from app.services.test_generation_prompts import (
    TEST_GENERATION_SYSTEM_PROMPT,
    build_refinement_user_prompt,
    build_retry_user_prompt,
    build_test_generation_user_prompt,
)

logger = logging.getLogger("smarttutor.test_generation")

# TODO: Might truncate 30-question MC tests. Test and bump to 8192 if it happens.
GENERATION_MAX_TOKENS = 4096


def _validate_generated_questions(
    raw_json: str,
    requested_types: set[QuestionType],
) -> tuple[list[GeneratedQuestionPreview], list[str]]:
    """Validate AI response and return (questions, errors)."""
    errors: list[str] = []

    try:
        data = json.loads(strip_code_fences(raw_json))
    except json.JSONDecodeError as exc:
        return [], [f"Invalid JSON: {exc}"]

    if not isinstance(data, dict) or "questions" not in data:
        return [], ["Response must be a JSON object with a 'questions' array"]

    raw_questions = data["questions"]
    if not isinstance(raw_questions, list) or not raw_questions:
        return [], ["'questions' must be a non-empty array"]

    questions: list[GeneratedQuestionPreview] = []
    seen_prompts: set[str] = set()

    for i, q in enumerate(raw_questions):
        prefix = f"Question {i + 1}"

        if not isinstance(q, dict):
            errors.append(f"{prefix}: must be an object")
            continue

        prompt = q.get("prompt", "")
        if not isinstance(prompt, str) or not prompt.strip():
            errors.append(f"{prefix}: missing or empty 'prompt'")
            continue

        normalized_prompt = prompt.strip().lower()
        if normalized_prompt in seen_prompts:
            errors.append(f"{prefix}: duplicate prompt")
            continue
        seen_prompts.add(normalized_prompt)

        type_str = q.get("type", "")
        try:
            q_type = QuestionType[type_str]
        except (KeyError, ValueError):
            errors.append(f"{prefix}: invalid type '{type_str}'. Must be SIMPLE or MULTIPLE_CHOICE")
            continue

        if q_type not in requested_types:
            errors.append(f"{prefix}: type {type_str} was not requested")
            continue

        points = q.get("points", 1.0)
        if not isinstance(points, int | float) or points <= 0:
            points = 1.0

        content = q.get("content")
        if not isinstance(content, dict):
            errors.append(f"{prefix}: missing or invalid 'content'")
            continue

        content_errors = _validate_content(q_type, content, prefix)
        if content_errors:
            errors.extend(content_errors)
            continue

        parsed_content = _parse_content(q_type, content)
        if parsed_content is None:
            errors.append(f"{prefix}: failed to parse content")
            continue

        questions.append(
            GeneratedQuestionPreview(
                question_type=q_type,
                prompt=prompt.strip(),
                points=float(points),
                content=parsed_content,
            )
        )

    return questions, errors


def _validate_content(q_type: QuestionType, content: dict, prefix: str) -> list[str]:  # type: ignore[type-arg]
    """Validate content dict for a specific question type. Returns list of errors."""
    errors: list[str] = []

    if q_type == QuestionType.SIMPLE:
        answers = content.get("answers")
        if not isinstance(answers, list) or not answers:
            errors.append(f"{prefix}: SIMPLE content must have non-empty 'answers' array")
        elif not all(isinstance(a, str) and a.strip() for a in answers):
            errors.append(f"{prefix}: all answers must be non-empty strings")

    elif q_type == QuestionType.MULTIPLE_CHOICE:
        options = content.get("options")
        if not isinstance(options, list):
            errors.append(f"{prefix}: MC content must have 'options' array")
        elif len(options) < 2 or len(options) > 6:
            errors.append(f"{prefix}: MC must have 2-6 options, got {len(options)}")
        elif not all(isinstance(o, str) and o.strip() for o in options):
            errors.append(f"{prefix}: all options must be non-empty strings")
        else:
            indices = content.get("correctIndices")
            if not isinstance(indices, list) or not indices:
                errors.append(f"{prefix}: MC must have non-empty 'correctIndices' array")
            elif not all(isinstance(idx, int) for idx in indices):
                errors.append(f"{prefix}: correctIndices must be integers")
            else:
                max_idx = len(options) - 1
                invalid_indices = [idx for idx in indices if idx < 0 or idx > max_idx]
                if invalid_indices:
                    errors.append(f"{prefix}: correctIndices {invalid_indices} out of range (0-{max_idx})")

    return errors


def _parse_content(q_type: QuestionType, content: dict) -> SimpleContent | MultipleChoiceContent | None:  # type: ignore[type-arg]
    """Parse validated content dict into the appropriate Pydantic model."""
    if q_type == QuestionType.SIMPLE:
        answers = [a.strip() for a in content["answers"]]
        return SimpleContent(answers=answers)

    if q_type == QuestionType.MULTIPLE_CHOICE:
        options = [o.strip() for o in content["options"]]
        correct_indices = content["correctIndices"]
        return MultipleChoiceContent(options=options, correct_indices=correct_indices)

    return None


def generate_test_questions(
    db: Session,
    *,
    current_user: User,
    data: TestGenerationRequest,
) -> TestGenerationResponse:
    note = get_note(db, note_id=data.note_id, current_user=current_user)

    if not note.content or not note.content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot generate questions from an empty note",
        )

    user_prompt = build_test_generation_user_prompt(
        note_content=note.content,
        question_count=data.question_count,
        question_types=data.question_types,
        difficulty=data.difficulty,
        guidance=data.guidance,
    )

    questions = _call_and_validate(
        user_prompt=user_prompt,
        requested_types=set(data.question_types),
    )

    return TestGenerationResponse(
        questions=questions,
        source_note_id=note.id,
        source_note_title=note.title,
    )


def refine_test_questions(
    db: Session,
    *,
    current_user: User,
    data: TestRefinementRequest,
) -> TestGenerationResponse:
    note = get_note(db, note_id=data.note_id, current_user=current_user)

    if not note.content or not note.content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot refine questions from an empty note",
        )

    current_questions_json = json.dumps(
        {"questions": [_question_to_ai_dict(q) for q in data.current_questions]},
        indent=2,
    )

    user_prompt = build_refinement_user_prompt(
        note_content=note.content,
        current_questions_json=current_questions_json,
        instructions=data.instructions,
    )

    requested_types = {q.question_type for q in data.current_questions}
    questions = _call_and_validate(
        user_prompt=user_prompt,
        requested_types=requested_types,
    )

    return TestGenerationResponse(
        questions=questions,
        source_note_id=note.id,
        source_note_title=note.title,
    )


def _question_to_ai_dict(q: GeneratedQuestionPreview) -> dict[str, object]:
    """Convert a GeneratedQuestionPreview back to the AI's JSON format."""
    content: dict[str, object] = {}
    if q.question_type == QuestionType.SIMPLE:
        if not isinstance(q.content, SimpleContent):
            raise ValueError(f"Expected SimpleContent for SIMPLE question, got {type(q.content).__name__}")
        content = {"answers": q.content.answers}
    elif q.question_type == QuestionType.MULTIPLE_CHOICE:
        if not isinstance(q.content, MultipleChoiceContent):
            raise ValueError(f"Expected MultipleChoiceContent for MC question, got {type(q.content).__name__}")
        content = {
            "options": q.content.options,
            "correctIndices": q.content.correct_indices,
        }

    return {
        "type": q.question_type.name,
        "prompt": q.prompt,
        "points": q.points,
        "content": content,
    }


def _call_and_validate(
    *,
    user_prompt: str,
    requested_types: set[QuestionType],
) -> list[GeneratedQuestionPreview]:
    """Call the LLM and validate the response. Retry once on validation failure."""
    raw = complete(system=TEST_GENERATION_SYSTEM_PROMPT, user=user_prompt, max_tokens=GENERATION_MAX_TOKENS)
    questions, errors = _validate_generated_questions(raw, requested_types)

    if errors and questions:
        logger.warning("Partial validation: %d valid, %d rejected: %s", len(questions), len(errors), errors)
    elif errors and not questions:
        logger.warning("First attempt failed validation: %s. Retrying...", errors)
        retry_prompt = build_retry_user_prompt(user_prompt, errors)
        raw = complete(system=TEST_GENERATION_SYSTEM_PROMPT, user=retry_prompt, max_tokens=GENERATION_MAX_TOKENS)
        questions, retry_errors = _validate_generated_questions(raw, requested_types)

        if retry_errors and not questions:
            logger.error("Retry also failed validation: %s", retry_errors)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="AI generated invalid questions after retry. Please try again.",
            )

    return questions

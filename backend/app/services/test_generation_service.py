import json
import logging
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.enums import AIFeature, LongTextLength, QuestionType
from app.models.user import User
from app.schemas.question import LongTextContent, MultipleChoiceContent, RubricItem, SimpleContent
from app.schemas.test_generation import (
    GeneratedQuestionPreview,
    QuestionEditRequest,
    TestGenerationRequest,
    TestGenerationResponse,
    TestRefinementRequest,
)
from app.services import token_usage_service
from app.services.grading_prompts import strip_code_fences
from app.services.llm import complete_for_user
from app.services.note_service import get_note
from app.services.test_generation_prompts import (
    TEST_GENERATION_SYSTEM_PROMPT,
    build_question_edit_user_prompt,
    build_refinement_user_prompt,
    build_retry_user_prompt,
    build_test_generation_user_prompt,
)

logger = logging.getLogger("smarttutor.test_generation")

# Empirically tuned per-question token budgets, sized to avoid AI response truncation
_BASE_TOKENS_PER_QUESTION = 200
_LONG_TEXT_EXTRA_TOKENS = 300
_MIN_GENERATION_TOKENS = 4096


def _estimate_max_tokens(
    question_count: int,
    question_types: set[QuestionType],
) -> int:
    per_q = _BASE_TOKENS_PER_QUESTION
    if QuestionType.LONG_TEXT in question_types:
        per_q += _LONG_TEXT_EXTRA_TOKENS
    return max(_MIN_GENERATION_TOKENS, question_count * per_q)


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
            errors.append(f"{prefix}: invalid type '{type_str}'. Must be SIMPLE, MULTIPLE_CHOICE or LONG_TEXT")
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


def _validate_content(q_type: QuestionType, content: dict[str, Any], prefix: str) -> list[str]:
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

    elif q_type == QuestionType.LONG_TEXT:
        length_limit = content.get("lengthLimit")
        if not isinstance(length_limit, int) or length_limit not in (1, 2, 3):
            errors.append(f"{prefix}: LONG_TEXT must have 'lengthLimit' of 1, 2, or 3")
        rubric = content.get("rubric")
        if not isinstance(rubric, list) or len(rubric) < 2:
            errors.append(f"{prefix}: LONG_TEXT must have at least 2 rubric items")
        elif not all(isinstance(r, dict) for r in rubric):
            errors.append(f"{prefix}: rubric items must be objects")
        else:
            snapped_weights: list[float] = []
            for j, item in enumerate(rubric):
                point = item.get("point")
                if not isinstance(point, str) or not point.strip():
                    errors.append(f"{prefix}: rubric[{j}] must have a non-empty 'point'")
                weight = item.get("weight")
                if not isinstance(weight, int | float) or weight <= 0 or weight > 1:
                    errors.append(f"{prefix}: rubric[{j}] weight must be between 0 and 1")
                else:
                    # Snap AI-generated weight to nearest 0.05 — rubric weights must be multiples of 0.05
                    snapped = round(round(float(weight) / 0.05) * 0.05, 2)
                    if snapped <= 0:
                        errors.append(f"{prefix}: rubric[{j}] weight {weight} is too small (rounds to 0)")
                    else:
                        snapped_weights.append(snapped)
            if snapped_weights and not errors:
                total = sum(snapped_weights)
                if total < 0.95 or total > 1.05:
                    errors.append(f"{prefix}: rubric weights sum to {total:.2f}, expected ~1.0")

    return errors


def _parse_content(
    q_type: QuestionType, content: dict[str, Any]
) -> SimpleContent | MultipleChoiceContent | LongTextContent | None:
    """Parse validated content dict into the appropriate Pydantic model."""
    if q_type == QuestionType.SIMPLE:
        answers = [a.strip() for a in content["answers"]]
        return SimpleContent(answers=answers)

    if q_type == QuestionType.MULTIPLE_CHOICE:
        options = [o.strip() for o in content["options"]]
        correct_indices = content["correctIndices"]
        return MultipleChoiceContent(options=options, correct_indices=correct_indices)

    if q_type == QuestionType.LONG_TEXT:
        length_limit = LongTextLength(content["lengthLimit"])
        rubric = [
            RubricItem(
                point=r["point"].strip(),
                # Must match the snapping in _parse_content above
                weight=round(round(float(r["weight"]) / 0.05) * 0.05, 2),
                category=r.get("category"),
            )
            for r in content["rubric"]
        ]
        return LongTextContent(length_limit=length_limit, rubric=rubric)

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

    requested_types = set(data.question_types)
    result = _call_and_validate(
        db,
        user=current_user,
        user_prompt=user_prompt,
        requested_types=requested_types,
        max_tokens=_estimate_max_tokens(data.question_count, requested_types),
        expected_count=data.question_count,
    )

    return TestGenerationResponse(
        questions=result.questions,
        source_note_id=note.id,
        source_note_title=note.title,
        warning=result.warning,
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

    expected = len(data.current_questions)
    result = _call_and_validate(
        db,
        user=current_user,
        user_prompt=user_prompt,
        requested_types=set(QuestionType),
        max_tokens=_estimate_max_tokens(expected, set(QuestionType)),
        expected_count=expected,
    )

    return TestGenerationResponse(
        questions=result.questions,
        source_note_id=note.id,
        source_note_title=note.title,
        warning=result.warning,
    )


def edit_test_questions(
    db: Session,
    *,
    current_user: User,
    data: QuestionEditRequest,
) -> TestGenerationResponse:
    if not data.all_questions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No questions provided",
        )

    max_index = len(data.all_questions) - 1
    invalid = [i for i in data.selected_indices if i < 0 or i > max_index]
    if invalid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Selected indices out of range: {invalid}",
        )

    all_questions_json = json.dumps(
        {"questions": [_question_to_ai_dict(q) for q in data.all_questions]},
        indent=2,
    )

    user_prompt = build_question_edit_user_prompt(
        all_questions_json=all_questions_json,
        selected_indices=data.selected_indices,
        instructions=data.instructions,
        note_content=data.note_content,
    )

    expected = len(data.all_questions)
    result = _call_and_validate(
        db,
        user=current_user,
        user_prompt=user_prompt,
        requested_types=set(QuestionType),
        max_tokens=_estimate_max_tokens(expected, set(QuestionType)),
        expected_count=expected,
    )

    return TestGenerationResponse(
        questions=result.questions,
        warning=result.warning,
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
    elif q.question_type == QuestionType.LONG_TEXT:
        if not isinstance(q.content, LongTextContent):
            raise ValueError(f"Expected LongTextContent for LONG_TEXT question, got {type(q.content).__name__}")
        content = {
            "lengthLimit": int(q.content.length_limit),
            "rubric": [{"point": r.point, "weight": r.weight, "category": r.category} for r in q.content.rubric],
        }

    return {
        "type": q.question_type.name,
        "prompt": q.prompt,
        "points": q.points,
        "content": content,
    }


class _GenerationResult:
    def __init__(self, questions: list[GeneratedQuestionPreview], warning: str | None = None) -> None:
        self.questions = questions
        self.warning = warning


def _call_and_validate(
    db: Session,
    *,
    user: User,
    user_prompt: str,
    requested_types: set[QuestionType],
    max_tokens: int = _MIN_GENERATION_TOKENS,
    expected_count: int | None = None,
) -> _GenerationResult:
    """Call the LLM and validate the response. Retry once on validation failure."""
    result = complete_for_user(
        user=user, system=TEST_GENERATION_SYSTEM_PROMPT, user_prompt=user_prompt, max_tokens=max_tokens
    )
    token_usage_service.record_usage(db, user_id=user.id, result=result, feature=AIFeature.TEST_GENERATION)
    questions, errors = _validate_generated_questions(result.text, requested_types)

    # Some questions parsed successfully despite others failing — keep the valid subset
    if errors and questions:
        logger.warning("Partial validation: %d valid, %d rejected: %s", len(questions), len(errors), errors)
    elif errors and not questions:
        logger.warning("First attempt failed validation: %s. Retrying...", errors)
        retry_prompt = build_retry_user_prompt(user_prompt, errors)
        result = complete_for_user(
            user=user, system=TEST_GENERATION_SYSTEM_PROMPT, user_prompt=retry_prompt, max_tokens=max_tokens
        )
        token_usage_service.record_usage(db, user_id=user.id, result=result, feature=AIFeature.TEST_GENERATION)
        questions, retry_errors = _validate_generated_questions(result.text, requested_types)

        if retry_errors and not questions:
            logger.error("Retry also failed validation: %s", retry_errors)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="AI generated invalid questions after retry. Please try again.",
            )

    warning = None
    if expected_count and len(questions) < expected_count:
        warning = f"Requested {expected_count} questions but only {len(questions)} were generated"
        logger.warning(warning)

    return _GenerationResult(questions=questions, warning=warning)

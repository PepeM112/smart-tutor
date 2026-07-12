import copy
import json
import logging

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.enums import AnswerStatus, QuestionType
from app.database import SessionLocal
from app.models.answer import Answer
from app.models.question import Question
from app.models.test_result import TestResult
from app.schemas.answer import ChallengeRequest
from app.schemas.question import LongTextContent
from app.services.grading.prompts.challenge import (
    CHALLENGE_SYSTEM_PROMPT,
    build_challenge_user_prompt,
)
from app.services.grading.prompts.grading import strip_code_fences
from app.services.grading_service import _recalculate_test_result
from app.services.llm import get_llm_client

logger = logging.getLogger("smarttutor.grading")


def _effective_met(entry: dict[str, object]) -> bool:
    cr = entry.get("challenge_result")
    if cr is not None and isinstance(cr, dict) and cr.get("met") is not None:
        return bool(cr["met"])
    return bool(entry.get("met", False))


def _validate_challenge_eligibility(
    answer: Answer,
    question: Question,
    request: ChallengeRequest,
    user_id: str,
) -> None:
    test_result = answer.test_result
    if test_result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test result not found")
    if test_result.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    if QuestionType(question.question_type) != QuestionType.LONG_TEXT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Long Text questions can be challenged",
        )

    answer_status = AnswerStatus(answer.status)
    if answer_status in (AnswerStatus.PENDING, AnswerStatus.FAILED):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot challenge an answer that hasn't been graded",
        )

    rubric_result = answer.rubric_result
    if not rubric_result:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Answer has no rubric result to challenge",
        )

    for criterion in request.criteria:
        idx = criterion.criterion_index
        if idx >= len(rubric_result):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Criterion index {idx} is out of range",
            )
        entry = rubric_result[idx]
        if entry.get("met", False):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Criterion {idx} is already marked as met",
            )
        if entry.get("challenge_result") is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Criterion {idx} has already been challenged",
            )


def challenge_answer(
    db: Session,
    *,
    answer_id: str,
    request: ChallengeRequest,
    user_id: str,
) -> Answer:
    answer = (
        db.execute(select(Answer).options(joinedload(Answer.test_result)).where(Answer.id == answer_id))
        .unique()
        .scalar_one_or_none()
    )
    if answer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Answer not found")

    question = db.execute(select(Question).where(Question.id == answer.question_id)).scalar_one_or_none()
    if question is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")

    _validate_challenge_eligibility(answer, question, request, user_id)

    rubric_result = list(answer.rubric_result)  # type: ignore[arg-type]
    for criterion in request.criteria:
        idx = criterion.criterion_index
        rubric_result[idx] = {
            **rubric_result[idx],
            "challenge_result": {
                "argument": criterion.argument,
                "met": None,
                "reason": "",
            },
        }

    answer.rubric_result = rubric_result
    db.commit()
    db.refresh(answer)

    return answer


def process_challenge(answer_id: str) -> None:
    db = SessionLocal()
    try:
        answer = db.execute(select(Answer).where(Answer.id == answer_id)).scalar_one_or_none()
        if answer is None:
            logger.error("Answer %s not found for challenge processing", answer_id)
            return

        question = db.execute(select(Question).where(Question.id == answer.question_id)).scalar_one_or_none()
        if question is None:
            logger.error("Question not found for answer %s", answer_id)
            return

        rubric_result: list[dict[str, object]] = copy.deepcopy(answer.rubric_result or [])
        pending_indices = [
            i
            for i, entry in enumerate(rubric_result)
            if entry.get("challenge_result") is not None and entry["challenge_result"].get("met") is None  # type: ignore[union-attr]
        ]

        if not pending_indices:
            return

        content = LongTextContent.model_validate(question.content)

        challenges_context = [
            {
                "index": i,
                "point": rubric_result[i].get("point", ""),
                "original_met": rubric_result[i].get("met", False),
                "original_reason": rubric_result[i].get("reason", ""),
                "argument": rubric_result[i]["challenge_result"]["argument"],  # type: ignore[index]
            }
            for i in pending_indices
        ]

        rubric_with_verdicts = [
            {
                "index": i,
                "point": entry.get("point", ""),
                "weight": entry.get("weight", 0),
                "met": entry.get("met", False),
                "reason": entry.get("reason", ""),
            }
            for i, entry in enumerate(rubric_result)
        ]

        user_prompt = build_challenge_user_prompt(
            question_prompt=question.prompt,
            rubric_with_verdicts=rubric_with_verdicts,
            student_answer=answer.user_answer,
            challenges=challenges_context,
        )

        logger.info(
            "Processing challenge for answer %s (%d criteria)",
            answer_id,
            len(pending_indices),
        )

        llm = get_llm_client()
        raw_response = llm.complete(system=CHALLENGE_SYSTEM_PROMPT, user=user_prompt, max_tokens=2048)
        cleaned = strip_code_fences(raw_response)
        parsed = json.loads(cleaned)
        results: list[dict[str, object]] = parsed["results"]

        result_map = {int(r["index"]): r for r in results}

        any_flipped = False
        for i in pending_indices:
            challenge_data: dict[str, object] = rubric_result[i]["challenge_result"]  # type: ignore[assignment]
            ai_result = result_map.get(i)
            if ai_result is not None:
                met = bool(ai_result.get("met", False))
                reason = str(ai_result.get("reason", ""))
            else:
                met = False
                reason = "No AI response for this criterion"

            challenge_data["met"] = met
            challenge_data["reason"] = reason

            if met:
                any_flipped = True

        answer.rubric_result = rubric_result

        if any_flipped:
            _recalculate_answer_status(answer, content)

            test_result = (
                db.execute(
                    select(TestResult)
                    .options(joinedload(TestResult.answers))
                    .where(TestResult.id == answer.test_result_id)
                )
                .unique()
                .scalar_one_or_none()
            )
            if test_result is not None:
                _recalculate_test_result(db, test_result)

        db.commit()

        met_count = sum(1 for i in pending_indices if result_map.get(i, {}).get("met", False))
        logger.info(
            "Challenge processed for answer %s: %d/%d criteria overturned",
            answer_id,
            met_count,
            len(pending_indices),
        )

    except Exception:
        logger.exception("Challenge processing failed for answer %s", answer_id)
        _mark_challenge_as_failed(db, answer_id)
        db.rollback()
    finally:
        db.close()


def _recalculate_answer_status(answer: Answer, content: LongTextContent) -> None:
    rubric_result = answer.rubric_result or []
    met_count = sum(1 for i, entry in enumerate(rubric_result) if _effective_met(entry))
    if met_count == len(content.rubric):
        answer.status = int(AnswerStatus.CORRECT)
    elif met_count == 0:
        answer.status = int(AnswerStatus.WRONG)
    else:
        answer.status = int(AnswerStatus.PARTIAL)


def _mark_challenge_as_failed(db: Session, answer_id: str) -> None:
    try:
        answer = db.execute(select(Answer).where(Answer.id == answer_id)).scalar_one_or_none()
        if answer is None:
            return
        rubric_result = copy.deepcopy(answer.rubric_result or [])
        for entry in rubric_result:
            cr = entry.get("challenge_result")
            if cr is not None and isinstance(cr, dict) and cr.get("met") is None:
                cr["met"] = False
                cr["reason"] = "Challenge processing failed"
        answer.rubric_result = rubric_result
        db.commit()
    except Exception:
        logger.exception("Could not mark challenge as failed for answer %s", answer_id)
        db.rollback()

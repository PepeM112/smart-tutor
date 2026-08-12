import json
import logging
from dataclasses import dataclass
from typing import TypedDict

from anthropic import APIStatusError as AnthropicAPIError
from anthropic import AuthenticationError as AnthropicAuthError
from openai import APIStatusError as OpenAIAPIError
from openai import AuthenticationError as OpenAIAuthError
from sqlalchemy import select
from sqlalchemy.orm import Session
from typing_extensions import NotRequired

from app.core.enums import AIFeature, AnswerStatus, QuestionType
from app.crud import answer as answer_crud
from app.crud import user as user_crud
from app.database import SessionLocal
from app.models.answer import Answer
from app.models.question import Question
from app.models.test_result import TestResult
from app.schemas.question import LongTextContent, RubricItem
from app.services.grading_prompts import GRADING_SYSTEM_PROMPT, build_grading_user_prompt, strip_code_fences
from app.services.llm import CompletionResult, LLMClient, get_user_llm_client

logger = logging.getLogger("smarttutor.grading")


class _RawCriterionDict(TypedDict):
    index: int
    met: bool
    reason: NotRequired[str]


@dataclass(frozen=True)
class CriterionResult:
    index: int
    met: bool
    reason: str = ""


def grade(
    llm: LLMClient, prompt: str, rubric: list[RubricItem], answer: str
) -> tuple[list[CriterionResult], CompletionResult]:
    """Grade a long-text answer against a rubric via the provided LLM client."""
    user_prompt = build_grading_user_prompt(prompt, rubric, answer)
    completion = llm.complete(system=GRADING_SYSTEM_PROMPT, user_prompt=user_prompt, max_tokens=2048)
    cleaned = strip_code_fences(completion.text)
    data: dict[str, list[_RawCriterionDict]] = json.loads(cleaned)
    criteria = [
        CriterionResult(index=item["index"], met=item["met"], reason=item.get("reason", "")) for item in data["results"]
    ]
    return criteria, completion


def effective_met(entry: dict[str, object]) -> bool:
    """Return the effective 'met' status, considering challenge overrides."""
    cr = entry.get("challenge_result")
    if cr is not None and isinstance(cr, dict) and cr.get("met") is not None:
        return bool(cr["met"])
    return bool(entry.get("met", False))


def _determine_status(results: list[CriterionResult], rubric_size: int) -> AnswerStatus:
    met_count = sum(1 for r in results if r.met)
    if met_count == rubric_size:
        return AnswerStatus.CORRECT
    if met_count == 0:
        return AnswerStatus.WRONG
    return AnswerStatus.PARTIAL


def _build_rubric_result(
    content: LongTextContent,
    results: list[CriterionResult],
) -> list[dict[str, object]]:
    result_map = {r.index: r for r in results}
    return [
        {
            "point": item.point,
            "met": result_map[i].met if i in result_map else False,
            "weight": item.weight,
            "reason": result_map[i].reason if i in result_map else "",
        }
        for i, item in enumerate(content.rubric)
    ]


def _score_from_rubric_result(
    content: LongTextContent,
    rubric_result: list[dict[str, object]],
    question_points: float,
) -> float:
    met_by_index = {i: effective_met(r) for i, r in enumerate(rubric_result)}
    total_weight = sum(item.weight for item in content.rubric)
    if total_weight <= 0:
        return 0.0
    earned_weight = sum(item.weight for i, item in enumerate(content.rubric) if met_by_index.get(i, False))
    return question_points * (earned_weight / total_weight)


def recalculate_test_result(db: Session, test_result: TestResult) -> None:
    """Recompute TestResult aggregates from current Answer states."""
    answers: list[Answer] = list(test_result.answers)
    question_ids = [a.question_id for a in answers]
    questions = db.execute(select(Question).where(Question.id.in_(question_ids))).scalars().all()
    q_map = {q.id: q for q in questions}

    correct = 0
    pending = 0
    earned_pts = 0.0
    pending_pts = 0.0
    total_pts = test_result.total_points

    for answer in answers:
        q = q_map.get(answer.question_id)
        if q is None:
            continue
        status = AnswerStatus(answer.status)
        if status == AnswerStatus.CORRECT:
            correct += 1
            earned_pts += q.points
        elif status == AnswerStatus.PARTIAL:
            if QuestionType(q.question_type) == QuestionType.LONG_TEXT:
                content = LongTextContent.model_validate(q.content)
                earned_pts += _score_from_rubric_result(content, answer.rubric_result or [], q.points)
            else:
                earned_pts += q.points * 0.5
        elif status == AnswerStatus.PENDING:
            pending += 1
            pending_pts += q.points

    graded_pts = total_pts - pending_pts
    score = round(earned_pts / graded_pts * 100, 2) if graded_pts > 0 else 0.0

    test_result.correct_answers = correct
    test_result.pending_answers = pending
    test_result.earned_points = round(earned_pts, 2)
    test_result.score = score


def _mark_all_pending_as_failed(db: Session, test_result_id: str) -> None:
    """Last-resort: mark every still-PENDING answer as FAILED so nothing stays in limbo."""
    try:
        test_result = answer_crud.get_test_result_with_answers(db, test_result_id=test_result_id)
        if test_result is None:
            return
        for answer in test_result.answers:
            if answer.status == int(AnswerStatus.PENDING):
                answer.status = int(AnswerStatus.FAILED)
        recalculate_test_result(db, test_result)
        db.commit()
        logger.error("Marked all pending answers as FAILED for TestResult %s", test_result_id)
    except Exception:
        logger.exception("Could not mark answers as FAILED for TestResult %s", test_result_id)
        db.rollback()


def grade_pending_answers(test_result_id: str) -> None:
    """Background task: grade all PENDING long-text answers for a TestResult."""
    db = SessionLocal()
    try:
        test_result = answer_crud.get_test_result_with_answers(db, test_result_id=test_result_id)

        if test_result is None:
            logger.error("TestResult %s not found for grading", test_result_id)
            return

        user = user_crud.get_by_id(db, id=test_result.user_id)
        if user is None:
            logger.error("User not found for TestResult %s", test_result_id)
            return

        llm = get_user_llm_client(user)

        pending_answers = [a for a in test_result.answers if a.status == int(AnswerStatus.PENDING)]
        if not pending_answers:
            return

        total = len(pending_answers)
        logger.info("Starting grading for TestResult %s (%d pending answers)", test_result_id, total)

        question_ids = [a.question_id for a in pending_answers]
        questions = db.execute(select(Question).where(Question.id.in_(question_ids))).scalars().all()
        q_map = {q.id: q for q in questions}

        for idx, answer in enumerate(pending_answers, 1):
            question = q_map.get(answer.question_id)
            if question is None or QuestionType(question.question_type) != QuestionType.LONG_TEXT:
                continue

            prompt_preview = question.prompt[:50] + ("..." if len(question.prompt) > 50 else "")
            logger.info('Q%d/%d "%s" -> sending to %s', idx, total, prompt_preview, llm.name)

            try:
                content = LongTextContent.model_validate(question.content)
                results, completion = grade(llm, question.prompt, content.rubric, answer.user_answer)

                from app.services import token_usage_service

                token_usage_service.record_usage(db, user_id=user.id, result=completion, feature=AIFeature.GRADING)

                status = _determine_status(results, len(content.rubric))
                answer.status = int(status)
                answer.rubric_result = _build_rubric_result(content, results)

                met_count = sum(1 for r in results if r.met)
                score = _score_from_rubric_result(content, answer.rubric_result or [], question.points)
                logger.info(
                    "Q%d/%d -> %s (%d/%d criteria met, %.2f/%.2f pts)",
                    idx,
                    total,
                    status.name,
                    met_count,
                    len(content.rubric),
                    score,
                    question.points,
                )
            except (AnthropicAuthError, OpenAIAuthError) as exc:
                logger.error(
                    "FAILED Q%d/%d -- AUTH ERROR: %s (check your API key)",
                    idx,
                    total,
                    exc,
                )
                answer.status = int(AnswerStatus.FAILED)
            except (AnthropicAPIError, OpenAIAPIError) as exc:
                logger.error(
                    "FAILED Q%d/%d -- API ERROR %d: %s",
                    idx,
                    total,
                    exc.status_code,
                    exc.message,
                )
                answer.status = int(AnswerStatus.FAILED)
            except (json.JSONDecodeError, KeyError, TypeError) as exc:
                logger.exception(
                    "FAILED Q%d/%d -- PARSE ERROR: AI response was not valid JSON (%s)",
                    idx,
                    total,
                    exc,
                )
                answer.status = int(AnswerStatus.FAILED)
            except Exception:
                logger.exception("FAILED Q%d/%d -- UNEXPECTED ERROR", idx, total)
                answer.status = int(AnswerStatus.FAILED)

        recalculate_test_result(db, test_result)
        db.commit()

        logger.info(
            "All answers graded. Final score: %.2f%% (%.2f/%.2f pts)",
            test_result.score,
            test_result.earned_points,
            test_result.total_points,
        )

    except ValueError as exc:
        logger.error("Grading aborted for TestResult %s -- CONFIG ERROR: %s", test_result_id, exc)
        _mark_all_pending_as_failed(db, test_result_id)
        db.rollback()
    except Exception:
        logger.exception("Grading task failed for TestResult %s", test_result_id)
        _mark_all_pending_as_failed(db, test_result_id)
        db.rollback()
    finally:
        db.close()

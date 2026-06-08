import logging

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.enums import AnswerStatus, QuestionType
from app.database import SessionLocal
from app.models.answer import Answer
from app.models.question import Question
from app.models.test_result import TestResult
from app.schemas.question import LongTextContent
from app.services.grading import CriterionResult, get_grading_provider

logger = logging.getLogger("smarttutor.grading")


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
    result_map = {r.index: r.met for r in results}
    return [
        {"point": item.point, "met": result_map.get(i, False), "weight": item.weight}
        for i, item in enumerate(content.rubric)
    ]


def _score_from_rubric_result(
    content: LongTextContent,
    rubric_result: list[dict[str, object]],
    question_points: float,
) -> float:
    met_by_index = {i: bool(r.get("met", False)) for i, r in enumerate(rubric_result)}
    total_weight = sum(item.weight for item in content.rubric)
    if total_weight <= 0:
        return 0.0
    earned_weight = sum(item.weight for i, item in enumerate(content.rubric) if met_by_index.get(i, False))
    return question_points * (earned_weight / total_weight)


def _recalculate_test_result(db: Session, test_result: TestResult) -> None:
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
            content = LongTextContent.model_validate(q.content)
            earned_pts += _score_from_rubric_result(content, answer.rubric_result or [], q.points)
        elif status == AnswerStatus.PENDING:
            pending += 1
            pending_pts += q.points

    graded_pts = total_pts - pending_pts
    score = round(earned_pts / graded_pts * 100, 2) if graded_pts > 0 else 0.0

    test_result.correct_answers = correct
    test_result.pending_answers = pending
    test_result.earned_points = round(earned_pts, 2)
    test_result.score = score


def grade_pending_answers(test_result_id: str) -> None:
    """Background task: grade all PENDING long-text answers for a TestResult."""
    db = SessionLocal()
    try:
        provider = get_grading_provider()

        test_result = (
            db.execute(
                select(TestResult).options(joinedload(TestResult.answers)).where(TestResult.id == test_result_id)
            )
            .unique()
            .scalar_one_or_none()
        )

        if test_result is None:
            logger.error("TestResult %s not found for grading", test_result_id)
            return

        pending_answers = [a for a in test_result.answers if a.status == int(AnswerStatus.PENDING)]
        if not pending_answers:
            return

        question_ids = [a.question_id for a in pending_answers]
        questions = db.execute(select(Question).where(Question.id.in_(question_ids))).scalars().all()
        q_map = {q.id: q for q in questions}

        for answer in pending_answers:
            question = q_map.get(answer.question_id)
            if question is None or QuestionType(question.question_type) != QuestionType.LONG_TEXT:
                continue

            try:
                content = LongTextContent.model_validate(question.content)
                results = provider.grade(question.prompt, content.rubric, answer.user_answer)

                answer.status = int(_determine_status(results, len(content.rubric)))
                answer.rubric_result = _build_rubric_result(content, results)

                logger.info(
                    "Graded answer %s: %s",
                    answer.id,
                    AnswerStatus(answer.status).name,
                )
            except Exception:
                logger.exception("Failed to grade answer %s — leaving as PENDING", answer.id)

        _recalculate_test_result(db, test_result)
        db.commit()

    except Exception:
        logger.exception("Grading task failed for TestResult %s", test_result_id)
        db.rollback()
    finally:
        db.close()

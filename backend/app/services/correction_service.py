"""
Answer correction service — atomized functions for grading answers.

Flow for a full test submission:
    correct_test() → for each question → correct_question() → correct_simple/mc/etc.

Each function has a single responsibility:
- correct_test: orchestrates grading, creates TestResult + Answer records
- correct_question: dispatches to the right type-specific corrector
- correct_simple_question: Levenshtein-based grading for free-text answers
- correct_multiple_choice_question: exact-match grading for MC answers
"""

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.enums import AnswerStatus, QuestionType
from app.crud import test_result as test_result_crud
from app.models.answer import Answer
from app.models.question import Question
from app.models.test_result import TestResult
from app.models.user import User
from app.schemas.correction import TestSubmission
from app.schemas.question import MultipleChoiceContent, SimpleContent
from app.services.test_service import get_test

# ---------------------------------------------------------------------------
# Levenshtein distance (pure Python, no external dependency)
# ---------------------------------------------------------------------------


def _levenshtein_distance(s1: str, s2: str) -> int:
    """Compute the Levenshtein (edit) distance between two strings."""
    if len(s1) < len(s2):
        return _levenshtein_distance(s2, s1)

    if len(s2) == 0:
        return len(s1)

    previous_row = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            # insertions, deletions, substitutions
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row

    return previous_row[-1]


# ---------------------------------------------------------------------------
# Type-specific correctors
# ---------------------------------------------------------------------------


def _grade_single_token(token: str, valid_answers: list[str]) -> AnswerStatus:
    """Grade a single user token against the list of valid answers."""
    best_distance: int | None = None
    for valid in valid_answers:
        normalized = valid.strip().lower()
        distance = _levenshtein_distance(token, normalized)

        if distance == 0:
            return AnswerStatus.CORRECT

        if best_distance is None or distance < best_distance:
            best_distance = distance

    if best_distance == 1 and len(token) >= 3:
        return AnswerStatus.PARTIAL

    return AnswerStatus.WRONG


def correct_simple_question(user_answer: str, valid_answers: list[str]) -> AnswerStatus:
    """
    Grade a simple (free-text) answer using Levenshtein distance.

    The user may type a single answer or multiple comma-separated answers
    (e.g. "ir, marchar"). Each token must match a valid answer. The overall
    status is the worst result across all tokens.

    Rules per token:
    - Distance 0 against any valid answer → CORRECT
    - Distance 1 AND token length ≥ 3 → PARTIAL (typo tolerance)
    - Distance ≥ 2 → WRONG
    """
    tokens = [t.strip().lower() for t in user_answer.split(",")]
    tokens = [t for t in tokens if t]

    if not tokens:
        return AnswerStatus.WRONG

    worst = AnswerStatus.CORRECT
    for token in tokens:
        result = _grade_single_token(token, valid_answers)
        if result == AnswerStatus.WRONG:
            return AnswerStatus.WRONG
        if result == AnswerStatus.PARTIAL:
            worst = AnswerStatus.PARTIAL

    return worst


def correct_multiple_choice_question(selected_indices: list[int], correct_indices: list[int]) -> AnswerStatus:
    """
    Grade a multiple-choice answer by comparing selected vs correct indices.

    Exact match required — all correct options selected, no extras.
    """
    if set(selected_indices) == set(correct_indices):
        return AnswerStatus.CORRECT
    return AnswerStatus.WRONG


# ---------------------------------------------------------------------------
# Question-level dispatcher
# ---------------------------------------------------------------------------


def correct_question(user_answer: str, question: Question) -> AnswerStatus:
    """
    Dispatch correction to the appropriate type-specific function.

    Returns the AnswerStatus for this single question.
    """
    q_type = QuestionType(question.question_type)
    raw: dict[str, object] = question.content or {}

    if q_type == QuestionType.SIMPLE:
        parsed = SimpleContent.model_validate(raw)
        return correct_simple_question(user_answer, parsed.answers)

    if q_type == QuestionType.MULTIPLE_CHOICE:
        parsed_mc = MultipleChoiceContent.model_validate(raw)
        correct_indices = parsed_mc.correct_indices
        # For MC, user_answer is a comma-separated list of selected indices
        try:
            selected = [int(i.strip()) for i in user_answer.split(",") if i.strip()]
        except ValueError:
            return AnswerStatus.WRONG
        return correct_multiple_choice_question(selected, correct_indices)

    # Long text and other types — not yet implemented
    return AnswerStatus.PENDING


# ---------------------------------------------------------------------------
# Test-level orchestrator
# ---------------------------------------------------------------------------


def correct_test(
    db: Session,
    *,
    test_id: str,
    current_user: User,
    submission: TestSubmission,
) -> TestResult:
    """
    Grade a full test submission with weighted scoring.

    Standalone questions use their own `points` value.
    Grouped questions are scored at the group level: `group.points * (correct / total)`.
    PARTIAL answers earn 50% credit. PENDING answers are excluded from scoring.
    """
    test = get_test(db, test_id=test_id, current_user=current_user)

    all_questions: list[Question] = list(test.questions)
    for group in test.question_groups:
        all_questions.extend(group.questions)

    questions_by_id = {q.id: q for q in all_questions}
    grouped_question_ids = {q.id for g in test.question_groups for q in g.questions}

    answers: list[Answer] = []
    answer_statuses: dict[str, AnswerStatus] = {}
    correct_count = 0
    pending_count = 0

    for question_answer in submission.answers:
        question = questions_by_id.get(question_answer.question_id)
        if question is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Question {question_answer.question_id} not found in test",
            )

        answer_status = correct_question(question_answer.user_answer, question)
        answer_statuses[question.id] = answer_status

        if answer_status == AnswerStatus.CORRECT:
            correct_count += 1
        elif answer_status == AnswerStatus.PENDING:
            pending_count += 1

        answers.append(
            Answer(
                question_id=question.id,
                user_answer=question_answer.user_answer,
                status=int(answer_status),
            )
        )

    earned_pts = 0.0
    pending_pts = 0.0
    total_pts = 0.0

    # Standalone questions — scored individually
    standalone_questions = [q for q in test.questions if q.id not in grouped_question_ids]
    for q in standalone_questions:
        total_pts += q.points
        s = answer_statuses.get(q.id)
        if s == AnswerStatus.CORRECT:
            earned_pts += q.points
        elif s == AnswerStatus.PARTIAL:
            earned_pts += q.points * 0.5
        elif s == AnswerStatus.PENDING:
            pending_pts += q.points

    # Grouped questions — scored at group level
    for group in test.question_groups:
        total_pts += group.points
        group_correct = 0.0
        group_total = len(group.questions)
        has_pending = False

        for q in group.questions:
            s = answer_statuses.get(q.id)
            if s == AnswerStatus.CORRECT:
                group_correct += 1
            elif s == AnswerStatus.PARTIAL:
                group_correct += 0.5
            elif s == AnswerStatus.PENDING:
                has_pending = True

        if has_pending:
            pending_pts += group.points
        elif group_total > 0:
            earned_pts += group.points * (group_correct / group_total)

    graded_pts = total_pts - pending_pts
    score = round(earned_pts / graded_pts * 100, 2) if graded_pts > 0 else 0.0

    test_result = test_result_crud.create(
        db,
        test_id=test_id,
        user_id=current_user.id,
        score=score,
        total_questions=len(all_questions),
        correct_answers=correct_count,
        pending_answers=pending_count,
        earned_points=round(earned_pts, 2),
        total_points=round(total_pts, 2),
        answers=answers,
    )
    db.commit()
    db.refresh(test_result)

    return test_result

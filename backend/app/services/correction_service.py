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

from typing import List

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.enums import AnswerStatus, QuestionType
from app.crud import test as test_crud
from app.models.answer import Answer
from app.models.question import Question
from app.models.test_result import TestResult
from app.models.user import User
from app.schemas.correction import TestSubmission

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


def correct_simple_question(user_answer: str, valid_answers: List[str]) -> AnswerStatus:
    """
    Grade a simple (free-text) answer using Levenshtein distance.

    Rules:
    - Empty answer → WRONG
    - Distance 0 against any valid answer → CORRECT
    - Distance 1 AND word length ≥ 3 → PARTIAL (typo tolerance)
    - Distance ≥ 2 → WRONG
    """
    cleaned = user_answer.strip().lower()
    if not cleaned:
        return AnswerStatus.WRONG

    best_distance = None
    for valid in valid_answers:
        normalized = valid.strip().lower()
        distance = _levenshtein_distance(cleaned, normalized)

        if distance == 0:
            return AnswerStatus.CORRECT

        if best_distance is None or distance < best_distance:
            best_distance = distance

    # Typo tolerance: distance 1 only if the word is 3+ chars
    if best_distance == 1 and len(cleaned) >= 3:
        return AnswerStatus.PARTIAL

    return AnswerStatus.WRONG


def correct_multiple_choice_question(selected_indices: List[int], correct_indices: List[int]) -> AnswerStatus:
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
    content = question.content

    if q_type == QuestionType.SIMPLE:
        valid_answers: list[str] = content.get("answers", [])
        return correct_simple_question(user_answer, valid_answers)

    if q_type == QuestionType.MULTIPLE_CHOICE:
        correct_indices: list[int] = content.get("correct_indices", [])
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
    Grade a full test submission.

    1. Validate the test exists and belongs to the user
    2. For each question, grade the answer
    3. Create a TestResult with all Answer records
    """
    test = test_crud.get_by_id(db, id=test_id)
    if test is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")
    if test.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    questions_by_id = {q.id: q for q in test.questions}
    answers: list[Answer] = []
    correct_count = 0

    for question_answer in submission.answers:
        question = questions_by_id.get(question_answer.question_id)
        if question is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Question {question_answer.question_id} not found in test",
            )

        answer_status = correct_question(question_answer.user_answer, question)
        if answer_status == AnswerStatus.CORRECT:
            correct_count += 1

        answers.append(
            Answer(
                question_id=question.id,
                user_answer=question_answer.user_answer,
                status=int(answer_status),
            )
        )

    total = len(test.questions)
    score = (correct_count / total * 100) if total > 0 else 0.0

    test_result = TestResult(
        test_id=test_id,
        user_id=current_user.id,
        score=round(score, 2),
        total_questions=total,
        correct_answers=correct_count,
        answers=answers,
    )
    db.add(test_result)
    db.commit()
    db.refresh(test_result)

    return test_result

"""Seed test submissions with pre-computed grading results."""

from sqlalchemy.orm import Session

from app.core.enums import AnswerStatus
from app.models.answer import Answer
from app.models.test import Test
from app.models.test_result import TestResult

# ── Spanish Vocabulary answers (Simple questions) ──
SPANISH_ANSWERS = {
    "hello": ("hola", AnswerStatus.CORRECT),
    "to go": ("ir", AnswerStatus.CORRECT),
    "cat": ("perro", AnswerStatus.WRONG),
    "house": ("casa", AnswerStatus.CORRECT),
    "thank you": ("gracias", AnswerStatus.CORRECT),
    "water": ("agua", AnswerStatus.CORRECT),
    "mother": ("madre", AnswerStatus.CORRECT),
    "father": ("papa", AnswerStatus.PARTIAL),  # Levenshtein 1 from "papá"
    "brother": ("hermano", AnswerStatus.CORRECT),
    "sister": ("hermana", AnswerStatus.CORRECT),
}

# ── History Long Text answers + rubric results ──
HISTORY_ANSWERS = {
    0: {
        "answer": (
            "The fall of the Roman Republic was accelerated by the First Triumvirate—an informal, uneasy political "
            "alliance formed in 60 BC between Julius Caesar, Pompey the Great, and Crassus. This alliance bypassed "
            "the Senate, but it fractured when Crassus died fighting the Parthians and Caesar's daughter Julia "
            "(Pompey's wife) died in childbirth. Politically isolated, Pompey aligned with traditionalist senators "
            "who feared Caesar's growing ambition. When the Senate ordered Caesar to disband his army, he refused, "
            "famously crossing the Rubicon river with his Thirteenth Legion in 49 BC, plunging Rome into civil war.\n\n"
            "Caesar's lightning-fast invasion caught the Senate unprepared. Pompey fled to Greece to consolidate a "
            "massive army, but Caesar pursued him and won a definitive tactical victory at the Battle of Pharsalus "
            "in 48 BC. Pompey fled to Egypt, where he was betrayed and assassinated by advisors to Pharaoh "
            "Ptolemy XIII. Caesar, arriving soon after, aligned with Cleopatra and spent the next few years "
            "systematically eliminating the remaining senatorial resistance across the Mediterranean.\n\n"
            "Upon returning to Rome, Caesar consolidated absolute authority. In early 44 BC, the Senate named him "
            "dictator perpetuo (dictator in perpetuity). This flagrant violation of republican tradition drove a "
            "group of senators, led by Brutus and Cassius, to assassinate Caesar on the Ides of March (44 BC). "
            "Instead of saving the Republic, this triggered a power vacuum. Caesar's adopted heir, Octavian, and "
            "general Mark Antony formed the Second Triumvirate, defeated the assassins, and then turned on each "
            "other. Octavian decisively crushed the combined forces of Antony and Cleopatra at the naval Battle "
            "of Actium in 31 BC. By 27 BC, Octavian took the title Augustus, becoming Rome's first Emperor."
        ),
        "status": AnswerStatus.CORRECT,
        "rubric_result": [
            {
                "met": True,
                "point": "Identifies the political crisis of the late Roman Republic as the backdrop",
                "reason": "Identifies Senate's loss of authority and the First Triumvirate bypassing institutions.",
                "weight": 0.15,
            },
            {
                "met": True,
                "point": "Names the First Triumvirate (Caesar, Pompey, Crassus) and explains its role in destabilising the Republic",
                "reason": "Names all three members, dates it to 60 BC, and explains destabilisation.",
                "weight": 0.1,
            },
            {
                "met": True,
                "point": "Mentions Caesar crossing the Rubicon (49 BC) and explains its significance",
                "reason": "Mentions crossing the Rubicon in 49 BC as the formal outbreak of civil war.",
                "weight": 0.15,
            },
            {
                "met": True,
                "point": "Refers to the Battle of Pharsalus (48 BC) as the decisive defeat of Pompey's forces",
                "reason": "Accurately describes Pharsalus in 48 BC as a decisive tactical victory.",
                "weight": 0.1,
            },
            {
                "met": True,
                "point": "Notes Pompey's flight to Egypt and his assassination there (48 BC)",
                "reason": "Notes Pompey fled to Egypt and was assassinated by advisors to Ptolemy XIII.",
                "weight": 0.05,
            },
            {
                "met": True,
                "point": "Mentions Caesar's assassination on the Ides of March (44 BC)",
                "reason": "Identifies assassination on Ides of March in 44 BC as trigger for next phase.",
                "weight": 0.1,
            },
            {
                "met": True,
                "point": "Explains the formation of the Second Triumvirate",
                "reason": "Names Octavian and Mark Antony forming the Second Triumvirate after Caesar's death.",
                "weight": 0.1,
            },
            {
                "met": True,
                "point": "Describes Octavian's final victory (Battle of Actium, 31 BC)",
                "reason": "Describes decisive victory at Actium in 31 BC over Antony and Cleopatra.",
                "weight": 0.15,
            },
            {
                "met": True,
                "point": "Connects the end of the civil wars to the fall of the Republic and rise of the Empire under Augustus",
                "reason": "Connects Octavian becoming Augustus and Rome's first Emperor by 27 BC.",
                "weight": 0.1,
            },
        ],
    },
    1: {
        "answer": (
            "The feudal system emerged across Western Europe between the 8th and 10th centuries out of absolute "
            "necessity. Following the collapse of the Carolingian Empire, central authority vanished, leaving Europe "
            "entirely defenseless against terrifying, rapid raids by Vikings, Magyars, and Saracens. Because monarchs "
            "lacked the treasury or standing armies to defend vast territories, power fragmented. Authority devolved "
            "to local warlords who could construct fortified castles and field immediate local military defense.\n\n"
            "At its core, feudalism was a social pyramid bound by reciprocal legal, military, and economic obligations "
            "based on the control of land (fiefs). The relationship between a lord and a vassal was finalized through "
            "a solemn oath of fealty. In exchange for land, the vassal promised military service (typically 40 days a "
            "year) and counsel in the lord's court. The vassal then ruled over their own manor.\n\n"
            "At the bottom of this pyramid sat the peasants and serfs. While some peasants were legally free, the "
            "vast majority were serfs. Serfs were not slaves—they could not be bought or sold away from the land—but "
            "they were legally bound to the estate. They were forced to farm the lord's personal land, pay heavy "
            "taxes in grain or livestock, and pay fees to use the lord's mill and oven. In return, the lord provided "
            "them with a small plot to feed their families and physical protection inside the castle walls during "
            "times of war.\n\n"
            "Strengths: It successfully restored localized order, safety, and self-sufficiency when central states "
            "failed.\nWeaknesses: It created intense political fragmentation, as conflicting vassal loyalties caused "
            "endless private wars. It also enforced severe social stagnation, locking the vast majority of the "
            "population into inherited, generational poverty."
        ),
        "status": AnswerStatus.PARTIAL,
        "rubric_result": [
            {
                "met": True,
                "point": "Explains that feudalism emerged after the fall of the Carolingian Empire",
                "reason": "Explicitly states emergence after Carolingian collapse and identifies Viking, Magyar, and Saracen raids.",
                "weight": 0.1,
            },
            {
                "met": True,
                "point": "Describes the hierarchical structure: king > nobles/lords > knights > peasants/serfs",
                "reason": "Describes the social pyramid from monarchs through lords and vassals down to serfs.",
                "weight": 0.15,
            },
            {
                "met": True,
                "point": "Defines the lord-vassal relationship",
                "reason": "Explains vassals received fiefs in exchange for military service and counsel through oath of fealty.",
                "weight": 0.15,
            },
            {
                "met": True,
                "point": "Explains the role of serfs",
                "reason": "Details serfs bound to the estate, farming lord's land, paying taxes, with limited freedoms.",
                "weight": 0.15,
            },
            {
                "met": True,
                "point": "Mentions the manor as the basic economic unit of feudalism",
                "reason": "Mentions the manor as the unit ruled by vassals with self-sufficient economic activity.",
                "weight": 0.1,
            },
            {
                "met": True,
                "point": "Identifies a strength",
                "reason": "States feudalism restored localized order, safety, and self-sufficiency.",
                "weight": 0.15,
            },
            {
                "met": True,
                "point": "Identifies a weakness",
                "reason": "Identifies political fragmentation and severe social stagnation.",
                "weight": 0.15,
            },
            {
                "met": False,
                "point": "Notes the role of the Church as a parallel power structure",
                "reason": "Not mentioned.",
                "weight": 0.05,
            },
        ],
    },
    2: {
        "answer": (
            "The Western Roman Empire fell in 476 AD due to internal decay and external pressure. Internally, "
            "political instability, civil wars, rampant inflation, and a reliance on unreliable mercenary armies "
            "crippled the state. Externally, migrating Germanic tribes pressured by the Huns shattered Rome's "
            "borders. The collapse splintered Europe into localized Germanic kingdoms, ending centralized ancient "
            "rule, disrupting trade, and allowing the Catholic Church to emerge as the primary unifying cultural force"
        ),
        "status": AnswerStatus.PARTIAL,
        "rubric_result": [
            {
                "met": True,
                "point": "Identifies internal factors",
                "reason": "The student identifies political instability and civil wars as internal factors.",
                "weight": 0.15,
            },
            {
                "met": True,
                "point": "Mentions economic decline",
                "reason": "The student mentions rampant inflation which covers currency debasement.",
                "weight": 0.15,
            },
            {
                "met": True,
                "point": "Mentions military weakness",
                "reason": "The student explicitly states reliance on unreliable mercenary armies.",
                "weight": 0.1,
            },
            {
                "met": True,
                "point": "Identifies external pressure: barbarian invasions",
                "reason": "The student identifies migrating Germanic tribes pressured by the Huns.",
                "weight": 0.15,
            },
            {
                "met": False,
                "point": "Names the deposition of Romulus Augustulus by Odoacer in 476 AD",
                "reason": "The student mentions 476 AD but does not name Romulus Augustulus or Odoacer.",
                "weight": 0.1,
            },
            {
                "met": False,
                "point": "Notes that the Eastern Roman Empire survived",
                "reason": "Not mentioned.",
                "weight": 0.1,
            },
            {
                "met": True,
                "point": "Describes the fragmentation of Western Europe",
                "reason": "The student states the collapse splintered Europe into localized Germanic kingdoms.",
                "weight": 0.15,
            },
            {
                "met": False,
                "point": "Connects the fall to the beginning of the Middle Ages",
                "reason": "Not explicitly connected.",
                "weight": 0.1,
            },
        ],
    },
}


def _find_question_by_prompt(test: Test, substring: str):
    for q in test.questions:
        if substring.lower() in q.prompt.lower():
            return q
    for g in test.question_groups:
        for q in g.questions:
            if substring.lower() in q.prompt.lower():
                return q
    raise ValueError(f"Question with '{substring}' not found in test '{test.title}'")


def seed_spanish_result(db: Session, user_id: str, test: Test) -> TestResult:
    answers = []
    answer_statuses: dict[str, AnswerStatus] = {}
    correct_count = 0

    for prompt_substr, (user_answer, answer_status) in SPANISH_ANSWERS.items():
        q = _find_question_by_prompt(test, prompt_substr)
        answers.append(Answer(question_id=q.id, user_answer=user_answer, status=int(answer_status)))
        answer_statuses[q.id] = answer_status
        if answer_status == AnswerStatus.CORRECT:
            correct_count += 1

    # Score using the same logic as correction_service:
    # standalone questions scored individually, grouped questions share group.points
    grouped_ids = {q.id for g in test.question_groups for q in g.questions}
    earned_pts = 0.0
    total_pts = 0.0

    for q in test.questions:
        if q.id not in grouped_ids:
            total_pts += q.points
            s = answer_statuses.get(q.id)
            if s == AnswerStatus.CORRECT:
                earned_pts += q.points
            elif s == AnswerStatus.PARTIAL:
                earned_pts += q.points * 0.5

    for group in test.question_groups:
        total_pts += group.points
        group_correct = 0.0
        for q in group.questions:
            s = answer_statuses.get(q.id)
            if s == AnswerStatus.CORRECT:
                group_correct += 1
            elif s == AnswerStatus.PARTIAL:
                group_correct += 0.5
        if len(group.questions) > 0:
            earned_pts += group.points * (group_correct / len(group.questions))

    score = round(earned_pts / total_pts * 100, 2) if total_pts > 0 else 0.0

    result = TestResult(
        test_id=test.id,
        user_id=user_id,
        total_questions=len(answers),
        correct_answers=correct_count,
        pending_answers=0,
        earned_points=round(earned_pts, 2),
        total_points=round(total_pts, 2),
        score=score,
        answers=answers,
    )
    db.add(result)
    db.flush()
    return result


def seed_history_result(db: Session, user_id: str, test: Test) -> TestResult:
    answers = []
    for q in sorted(test.questions, key=lambda q: q.order):
        data = HISTORY_ANSWERS[q.order]
        answers.append(
            Answer(
                question_id=q.id,
                user_answer=data["answer"],
                status=int(data["status"]),
                rubric_result=data["rubric_result"],
            )
        )

    scores = {}
    for q_order, data in HISTORY_ANSWERS.items():
        earned = sum(r["weight"] for r in data["rubric_result"] if r["met"])
        total = sum(r["weight"] for r in data["rubric_result"])
        scores[q_order] = (earned / total * 100) if total > 0 else 0

    avg_score = round(sum(scores.values()) / len(scores), 2)
    correct = sum(1 for s in scores.values() if s >= 80)

    result = TestResult(
        test_id=test.id,
        user_id=user_id,
        total_questions=len(test.questions),
        correct_answers=correct,
        pending_answers=0,
        earned_points=sum(scores.values()) / 100,
        total_points=float(len(test.questions)),
        score=avg_score,
        answers=answers,
    )
    db.add(result)
    db.flush()
    return result

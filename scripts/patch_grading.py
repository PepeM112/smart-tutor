"""Patch Long Text answers with pre-computed AI grading results.

Usage: python patch_grading.py <test_result_id> <q_roman_id> <q_feudal_id> <q_fall_id>
"""

import json
import sys

from app.database import SessionLocal
from sqlalchemy import text

result_id = sys.argv[1]
q_roman = sys.argv[2]
q_feudal = sys.argv[3]
q_fall = sys.argv[4]

RUBRICS = {
    q_fall: {
        "status": 3,
        "rubric": [
            {
                "met": True,
                "point": "Identifies internal factors: political instability, corruption, frequent changes of emperor, division of the Empire (East/West)",
                "reason": "The student identifies political instability and civil wars as internal factors.",
                "weight": 0.15,
            },
            {
                "met": True,
                "point": "Mentions economic decline: heavy taxation, reliance on slave labour, trade disruption, debasement of currency",
                "reason": "The student mentions rampant inflation which covers currency debasement.",
                "weight": 0.15,
            },
            {
                "met": True,
                "point": "Mentions military weakness: overreliance on mercenaries (foederati), difficulty defending long borders",
                "reason": "The student explicitly states reliance on unreliable mercenary armies.",
                "weight": 0.1,
            },
            {
                "met": True,
                "point": "Identifies external pressure: barbarian invasions (Visigoths, Vandals, Huns, Ostrogoths) as a major factor",
                "reason": "The student identifies migrating Germanic tribes pressured by the Huns.",
                "weight": 0.15,
            },
            {
                "met": False,
                "point": "Names the deposition of Romulus Augustulus by Odoacer in 476 AD as the traditional end date",
                "reason": "The student mentions 476 AD but does not name Romulus Augustulus or Odoacer.",
                "weight": 0.1,
            },
            {
                "met": False,
                "point": "Notes that the Eastern Roman Empire (Byzantine) survived and continued for nearly a thousand years",
                "reason": "Not mentioned.",
                "weight": 0.1,
            },
            {
                "met": True,
                "point": "Describes the fragmentation of Western Europe into smaller Germanic kingdoms",
                "reason": "The student states the collapse splintered Europe into localized Germanic kingdoms.",
                "weight": 0.15,
            },
            {
                "met": False,
                "point": "Connects the fall to the beginning of the Middle Ages / Early Medieval period",
                "reason": "Not explicitly connected.",
                "weight": 0.1,
            },
        ],
    },
    q_feudal: {
        "status": 3,
        "rubric": [
            {
                "met": True,
                "point": "Explains that feudalism emerged after the fall of the Carolingian Empire / collapse of central authority, as a response to Viking, Magyar, and Saracen invasions",
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
                "point": "Defines the lord-vassal relationship: the lord grants a fief (land) in exchange for military service and loyalty",
                "reason": "Explains vassals received fiefs in exchange for military service and counsel through oath of fealty.",
                "weight": 0.15,
            },
            {
                "met": True,
                "point": "Explains the role of serfs: bound to the land, worked the lord's fields, owed labour and a share of their harvest, had limited freedoms",
                "reason": "Details serfs bound to the estate, farming lord's land, paying taxes, with limited freedoms.",
                "weight": 0.15,
            },
            {
                "met": True,
                "point": "Mentions the manor as the basic economic unit of feudalism (self-sufficient estate)",
                "reason": "Mentions the manor as the unit ruled by vassals with self-sufficient economic activity.",
                "weight": 0.1,
            },
            {
                "met": True,
                "point": "Identifies a strength: provided local order, protection, and military defence in the absence of a strong central state",
                "reason": "States feudalism restored localized order, safety, and self-sufficiency.",
                "weight": 0.15,
            },
            {
                "met": True,
                "point": "Identifies a weakness: rigid social immobility, exploitation of peasants, fragmentation of political power, slow economic development",
                "reason": "Identifies political fragmentation and severe social stagnation.",
                "weight": 0.15,
            },
            {
                "met": False,
                "point": "Notes the role of the Church as a parallel power structure in medieval feudal society",
                "reason": "Not mentioned.",
                "weight": 0.05,
            },
        ],
    },
    q_roman: {
        "status": 1,
        "rubric": [
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
}

db = SessionLocal()

for qid, data in RUBRICS.items():
    db.execute(
        text(
            "UPDATE answer SET status = :status, rubric_result = :rubric WHERE test_result_id = :rid AND question_id = :qid"
        ),
        {"status": data["status"], "rubric": json.dumps(data["rubric"]), "rid": result_id, "qid": qid},
    )

scores = {}
for qid, data in RUBRICS.items():
    earned = sum(r["weight"] for r in data["rubric"] if r["met"])
    total = sum(r["weight"] for r in data["rubric"])
    scores[qid] = (earned / total * 100) if total > 0 else 0

avg_score = sum(scores.values()) / len(scores)
correct = sum(1 for s in scores.values() if s >= 80)

db.execute(
    text("UPDATE test_result SET score = :score, correct_answers = :correct, pending_answers = 0 WHERE id = :rid"),
    {"score": round(avg_score, 2), "correct": correct, "rid": result_id},
)

db.commit()
db.close()
print(f"done (score: {avg_score:.1f}%)")

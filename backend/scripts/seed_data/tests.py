"""Seed tests with questions and question groups."""

from sqlalchemy.orm import Session

from app.core.enums import QuestionGroupType, QuestionType
from app.models.question import Question
from app.models.test import Test
from app.models.test_question_group import TestQuestionGroup


def seed_tests(db: Session, user_id: str) -> dict[str, Test]:
    # ── Test 1: Spanish Vocabulary (Simple + grouped) ──
    t1 = Test(user_id=user_id, title="Spanish Vocabulary", description="Basic Spanish words for review testing")
    t1.questions = [
        Question(
            question_type=QuestionType.SIMPLE,
            prompt='How do you say "hello" in Spanish?',
            content={"answers": ["hola"]},
            hint="Think of a common greeting",
            explanation='"Hola" is the most common informal greeting in Spanish.',
            order=0,
        ),
        Question(
            question_type=QuestionType.SIMPLE,
            prompt='Translate: "to go"',
            content={"answers": ["ir", "marchar"]},
            explanation='"Ir" is the most common translation. "Marchar" also works in some contexts.',
            order=1,
        ),
        Question(
            question_type=QuestionType.SIMPLE,
            prompt='What is "cat" in Spanish?',
            content={"answers": ["gato"]},
            order=2,
        ),
        Question(
            question_type=QuestionType.SIMPLE,
            prompt='Translate: "house"',
            content={"answers": ["casa", "hogar"]},
            hint="One of the first words you learn",
            order=3,
        ),
        Question(
            question_type=QuestionType.SIMPLE,
            prompt='How do you say "thank you"?',
            content={"answers": ["gracias"]},
            explanation='"Gracias" — always be polite!',
            order=4,
        ),
        Question(
            question_type=QuestionType.SIMPLE,
            prompt='Translate: "water"',
            content={"answers": ["agua"]},
            order=5,
        ),
    ]

    family_group = TestQuestionGroup(
        type=QuestionGroupType.VOCABULARY,
        order=6,
        title="Family Members",
        points=1.0,
    )
    family_group.questions = [
        Question(
            question_type=QuestionType.SIMPLE,
            prompt='Translate: "mother"',
            content={"answers": ["madre", "mamá"]},
            hint="Very similar to English",
            order=0,
        ),
        Question(
            question_type=QuestionType.SIMPLE,
            prompt='Translate: "father"',
            content={"answers": ["padre", "papá"]},
            order=1,
        ),
        Question(
            question_type=QuestionType.SIMPLE,
            prompt='Translate: "brother"',
            content={"answers": ["hermano"]},
            order=2,
        ),
        Question(
            question_type=QuestionType.SIMPLE,
            prompt='Translate: "sister"',
            content={"answers": ["hermana"]},
            order=3,
        ),
    ]
    t1.question_groups = [family_group]
    db.add(t1)

    # ── Test 2: World Geography (MC + Simple) ──
    t2 = Test(user_id=user_id, title="World Geography", description="Capitals, flags, and continents")
    t2.questions = [
        Question(
            question_type=QuestionType.MULTIPLE_CHOICE,
            prompt="Which of these are European countries?",
            content={"options": ["France", "Brazil", "Germany", "Japan", "Italy"], "correct_indices": [0, 2, 4]},
            explanation="France, Germany, and Italy are in Europe. Brazil is in South America, Japan in Asia.",
            order=0,
        ),
        Question(
            question_type=QuestionType.MULTIPLE_CHOICE,
            prompt="What is the capital of Australia?",
            content={"options": ["Sydney", "Melbourne", "Canberra", "Brisbane"], "correct_indices": [2]},
            hint="It is NOT the largest city",
            explanation="Canberra is the capital. Sydney is the largest city but not the capital.",
            order=1,
        ),
        Question(
            question_type=QuestionType.MULTIPLE_CHOICE,
            prompt="Which continents does the equator cross?",
            content={"options": ["Africa", "South America", "Asia", "Europe"], "correct_indices": [0, 1, 2]},
            order=2,
        ),
        Question(
            question_type=QuestionType.MULTIPLE_CHOICE,
            prompt="Which ocean is the largest?",
            content={"options": ["Atlantic", "Pacific", "Indian", "Arctic"], "correct_indices": [1]},
            explanation="The Pacific Ocean covers more area than all landmasses combined.",
            order=3,
        ),
        Question(
            question_type=QuestionType.SIMPLE,
            prompt="What is the capital of France?",
            content={"answers": ["Paris", "paris"]},
            order=4,
        ),
        Question(
            question_type=QuestionType.SIMPLE,
            prompt="What is the longest river in the world?",
            content={"answers": ["Nile", "nile", "the nile", "rio nilo"]},
            hint="Its in Africa",
            explanation="The Nile flows through northeastern Africa, approximately 6,650 km long.",
            order=5,
        ),
    ]
    db.add(t2)

    # ── Test 3: Spanish Basics MC ──
    t3 = Test(
        user_id=user_id,
        title="Spanish Basics — Multiple Choice",
        description="Vocabulary and grammar basics, multiple choice only",
    )
    t3.questions = [
        Question(
            question_type=QuestionType.MULTIPLE_CHOICE,
            prompt='Which of these means "thank you" in Spanish?',
            content={"options": ["Gracias", "Por favor", "De nada", "Lo siento"], "correct_indices": [0]},
            explanation='"Gracias" means "thank you". "Por favor" is "please", "de nada" is "you\'re welcome", '
            'and "lo siento" is "I\'m sorry".',
            order=0,
        ),
        Question(
            question_type=QuestionType.MULTIPLE_CHOICE,
            prompt="Which of these are colors in Spanish?",
            content={"options": ["Rojo", "Mesa", "Azul", "Silla"], "correct_indices": [0, 2]},
            hint='"Mesa" and "silla" are pieces of furniture',
            explanation='"Rojo" (red) and "azul" (blue) are colors. "Mesa" means table and "silla" means chair.',
            order=1,
        ),
        Question(
            question_type=QuestionType.MULTIPLE_CHOICE,
            prompt='Which of these are Spanish definite articles ("the")?',
            content={"options": ["El", "La", "Los", "Un"], "correct_indices": [0, 1, 2]},
            hint='"Un" is an indefinite article, not a definite one',
            explanation='"El", "la", and "los" are definite articles ("the"). "Un" is an indefinite article ("a/an").',
            order=2,
        ),
        Question(
            question_type=QuestionType.MULTIPLE_CHOICE,
            prompt="Which of these are days of the week in Spanish?",
            content={"options": ["Lunes", "Enero", "Martes", "Verano"], "correct_indices": [0, 2]},
            explanation='"Lunes" (Monday) and "martes" (Tuesday) are days of the week. '
            '"Enero" is a month and "verano" is a season.',
            order=3,
        ),
        Question(
            question_type=QuestionType.MULTIPLE_CHOICE,
            prompt='What is the correct conjugation of "ser" for "yo" (I am)?',
            content={"options": ["Soy", "Eres", "Es", "Somos"], "correct_indices": [0]},
            hint='Think of the phrase "yo ___ estudiante"',
            explanation='"Soy" is the first-person singular form of "ser". '
            '"Eres" is for "tu", "es" for "el/ella", and "somos" for "nosotros".',
            order=4,
        ),
        Question(
            question_type=QuestionType.MULTIPLE_CHOICE,
            prompt="Which of these are numbers in Spanish?",
            content={"options": ["Tres", "Perro", "Cinco", "Azul"], "correct_indices": [0, 2]},
            hint='"Perro" and "azul" are not numbers',
            explanation='"Tres" (three) and "cinco" (five) are numbers. "Perro" means dog and "azul" means blue.',
            order=5,
        ),
    ]
    db.add(t3)

    # ── Test 4: History Long Text ──
    t4 = Test(
        user_id=user_id,
        title="History 2º ESO — Long Text Exam",
        description="Development questions on ancient and medieval history. AI-graded against rubric criteria.",
    )
    t4.questions = [
        Question(
            question_type=QuestionType.LONG_TEXT,
            order=0,
            points=1.0,
            prompt="Explain the Roman Civil Wars between Julius Caesar, Pompey, and the events that led to the fall "
            "of the Roman Republic and the rise of the Empire. Cover the key political context, the main "
            "battles and turning points, and the final outcome. (~8-10 lines)",
            content={
                "length_limit": 2,
                "rubric": [
                    {
                        "point": "Identifies the political crisis of the late Roman Republic as the backdrop (collapse of traditional institutions, Senate's loss of authority)",
                        "weight": 0.15,
                        "category": "Context & Causes",
                    },
                    {
                        "point": "Names the First Triumvirate (Caesar, Pompey, Crassus) and explains its role in destabilising the Republic",
                        "weight": 0.10,
                        "category": "Context & Causes",
                    },
                    {
                        "point": "Mentions Caesar crossing the Rubicon (49 BC) and explains its significance as the formal outbreak of the war against Pompey and the Senate",
                        "weight": 0.15,
                        "category": "Key Events",
                    },
                    {
                        "point": "Refers to the Battle of Pharsalus (48 BC) as the decisive defeat of Pompey's forces by Caesar",
                        "weight": 0.10,
                        "category": "Key Events",
                    },
                    {
                        "point": "Notes Pompey's flight to Egypt and his assassination there (48 BC)",
                        "weight": 0.05,
                        "category": "Key Events",
                    },
                    {
                        "point": "Mentions Caesar's assassination on the Ides of March (44 BC) and identifies it as the trigger for the next phase of civil war",
                        "weight": 0.10,
                        "category": "Key Events",
                    },
                    {
                        "point": "Explains the formation of the Second Triumvirate (Mark Antony, Octavian, Lepidus) following Caesar's death and its role in the subsequent wars",
                        "weight": 0.10,
                        "category": "Key Events",
                    },
                    {
                        "point": "Describes Octavian's final victory (Battle of Actium, 31 BC) over Mark Antony and Cleopatra, and Lepidus's marginalisation",
                        "weight": 0.15,
                        "category": "Outcomes & Significance",
                    },
                    {
                        "point": "Connects the end of the civil wars to the fall of the Roman Republic and the establishment of the Principate / Roman Empire under Augustus",
                        "weight": 0.10,
                        "category": "Outcomes & Significance",
                    },
                ],
            },
        ),
        Question(
            question_type=QuestionType.LONG_TEXT,
            order=1,
            points=1.0,
            prompt="Describe the feudal system in medieval Europe. Explain its social structure, the obligations "
            "between lords and vassals, and the role of peasants and serfs. Why did this system emerge, and "
            "what were its main strengths and weaknesses? (~8-10 lines)",
            content={
                "length_limit": 2,
                "rubric": [
                    {
                        "point": "Explains that feudalism emerged after the fall of the Carolingian Empire / collapse of central authority, as a response to Viking, Magyar, and Saracen invasions",
                        "weight": 0.10,
                        "category": "Origins",
                    },
                    {
                        "point": "Describes the hierarchical structure: king → nobles/lords → knights → peasants/serfs",
                        "weight": 0.15,
                        "category": "Social Structure",
                    },
                    {
                        "point": "Defines the lord-vassal relationship: the lord grants a fief (land) in exchange for military service and loyalty",
                        "weight": 0.15,
                        "category": "Social Structure",
                    },
                    {
                        "point": "Explains the role of serfs: bound to the land, worked the lord's fields, owed labour and a share of their harvest, had limited freedoms",
                        "weight": 0.15,
                        "category": "Social Structure",
                    },
                    {
                        "point": "Mentions the manor as the basic economic unit of feudalism (self-sufficient estate)",
                        "weight": 0.10,
                        "category": "Economy",
                    },
                    {
                        "point": "Identifies a strength: provided local order, protection, and military defence in the absence of a strong central state",
                        "weight": 0.15,
                        "category": "Evaluation",
                    },
                    {
                        "point": "Identifies a weakness: rigid social immobility, exploitation of peasants, fragmentation of political power, slow economic development",
                        "weight": 0.15,
                        "category": "Evaluation",
                    },
                    {
                        "point": "Notes the role of the Church as a parallel power structure in medieval feudal society",
                        "weight": 0.05,
                        "category": "Evaluation",
                    },
                ],
            },
        ),
        Question(
            question_type=QuestionType.LONG_TEXT,
            order=2,
            points=1.0,
            prompt="Explain the main causes and consequences of the fall of the Western Roman Empire (476 AD). "
            "What internal and external factors contributed to its collapse, and how did it reshape Europe? "
            "(~6-8 lines)",
            content={
                "length_limit": 1,
                "rubric": [
                    {
                        "point": "Identifies internal factors: political instability, corruption, frequent changes of emperor, division of the Empire (East/West)",
                        "weight": 0.15,
                        "category": "Internal Causes",
                    },
                    {
                        "point": "Mentions economic decline: heavy taxation, reliance on slave labour, trade disruption, debasement of currency",
                        "weight": 0.15,
                        "category": "Internal Causes",
                    },
                    {
                        "point": "Mentions military weakness: overreliance on mercenaries (foederati), difficulty defending long borders",
                        "weight": 0.10,
                        "category": "Internal Causes",
                    },
                    {
                        "point": "Identifies external pressure: barbarian invasions (Visigoths, Vandals, Huns, Ostrogoths) as a major factor",
                        "weight": 0.15,
                        "category": "External Causes",
                    },
                    {
                        "point": "Names the deposition of Romulus Augustulus by Odoacer in 476 AD as the traditional end date",
                        "weight": 0.10,
                        "category": "Key Events",
                    },
                    {
                        "point": "Notes that the Eastern Roman Empire (Byzantine) survived and continued for nearly a thousand years",
                        "weight": 0.10,
                        "category": "Consequences",
                    },
                    {
                        "point": "Describes the fragmentation of Western Europe into smaller Germanic kingdoms",
                        "weight": 0.15,
                        "category": "Consequences",
                    },
                    {
                        "point": "Connects the fall to the beginning of the Middle Ages / Early Medieval period",
                        "weight": 0.10,
                        "category": "Consequences",
                    },
                ],
            },
        ),
    ]
    db.add(t4)

    # Set user_id on all questions (required NOT NULL field)
    for test in [t1, t2, t3, t4]:
        for q in test.questions:
            q.user_id = user_id
        for g in test.question_groups:
            for q in g.questions:
                q.user_id = user_id

    db.flush()
    return {"spanish_vocab": t1, "geography": t2, "spanish_mc": t3, "history": t4}

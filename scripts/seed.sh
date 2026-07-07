#!/usr/bin/env bash
# Seed script — creates a test user and all sample tests.
#
# Usage: bash scripts/seed.sh
# Requires: curl, jq, backend running at localhost:8000

set -euo pipefail

API="http://localhost:8000/api/v1"
COOKIE_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR"' EXIT

EMAIL="reviewer@test.com"
PASSWORD="Test1234!"

echo "=== Seeding test data ==="

# --- Register (ignore 400 if user already exists) ---
echo -n "Creating user... "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$API/users/signup" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"reviewer\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
if [ "$STATUS" = "201" ]; then echo "created"; else echo "already exists (${STATUS})"; fi

# --- Login (save cookie) ---
echo -n "Logging in... "
curl -s -o /dev/null -c "$COOKIE_JAR" \
  -X POST "$API/users/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=$EMAIL&password=$PASSWORD"
echo "done"

# --- Clean previous data for this user ---
echo -n "Cleaning previous data... "
docker exec -i backend python3 - "$EMAIL" < "$(dirname "$0")/clean_user.py" 2>&1 | grep -v "INFO\|sqlalchemy"

# Helper: POST with auth cookie
post() {
  curl -s -b "$COOKIE_JAR" -X POST "$1" -H "Content-Type: application/json" -d "$2"
}

# ============================================================
# Test 1: Spanish Vocabulary (Simple questions)
# ============================================================
echo -n "Creating test: Spanish Vocabulary... "
TEST1=$(post "$API/tests" '{
  "title": "Spanish Vocabulary",
  "description": "Basic Spanish words for review testing",
  "questions": [
    {
      "questionType": 1,
      "prompt": "How do you say \"hello\" in Spanish?",
      "content": {"answers": ["hola"]},
      "hint": "Think of a common greeting",
      "explanation": "\"Hola\" is the most common informal greeting in Spanish.",
      "order": 0
    },
    {
      "questionType": 1,
      "prompt": "Translate: \"to go\"",
      "content": {"answers": ["ir", "marchar"]},
      "explanation": "\"Ir\" is the most common translation. \"Marchar\" also works in some contexts.",
      "order": 1
    },
    {
      "questionType": 1,
      "prompt": "What is \"cat\" in Spanish?",
      "content": {"answers": ["gato"]},
      "order": 2
    },
    {
      "questionType": 1,
      "prompt": "Translate: \"house\"",
      "content": {"answers": ["casa", "hogar"]},
      "hint": "One of the first words you learn",
      "order": 3
    },
    {
      "questionType": 1,
      "prompt": "How do you say \"thank you\"?",
      "content": {"answers": ["gracias"]},
      "explanation": "\"Gracias\" — always be polite!",
      "order": 4
    },
    {
      "questionType": 1,
      "prompt": "Translate: \"water\"",
      "content": {"answers": ["agua"]},
      "order": 5
    }
  ],
  "questionGroups": [
    {
      "type": 1,
      "order": 6,
      "title": "Family Members",
      "points": 1.0,
      "questions": [
        {
          "questionType": 1,
          "prompt": "Translate: \"mother\"",
          "content": {"answers": ["madre", "mamá"]},
          "hint": "Very similar to English",
          "order": 0
        },
        {
          "questionType": 1,
          "prompt": "Translate: \"father\"",
          "content": {"answers": ["padre", "papá"]},
          "order": 1
        },
        {
          "questionType": 1,
          "prompt": "Translate: \"brother\"",
          "content": {"answers": ["hermano"]},
          "order": 2
        },
        {
          "questionType": 1,
          "prompt": "Translate: \"sister\"",
          "content": {"answers": ["hermana"]},
          "order": 3
        }
      ]
    }
  ]
}')
TEST1_ID=$(echo "$TEST1" | jq -r '.id')
echo "$TEST1_ID"

# ============================================================
# Test 2: Geography (MC questions + a couple Simple)
# ============================================================
echo -n "Creating test: World Geography... "
TEST2=$(post "$API/tests" '{
  "title": "World Geography",
  "description": "Capitals, flags, and continents",
  "questions": [
    {
      "questionType": 2,
      "prompt": "Which of these are European countries?",
      "content": {"options": ["France", "Brazil", "Germany", "Japan", "Italy"], "correct_indices": [0, 2, 4]},
      "explanation": "France, Germany, and Italy are in Europe. Brazil is in South America, Japan in Asia.",
      "order": 0
    },
    {
      "questionType": 2,
      "prompt": "What is the capital of Australia?",
      "content": {"options": ["Sydney", "Melbourne", "Canberra", "Brisbane"], "correct_indices": [2]},
      "hint": "It is NOT the largest city",
      "explanation": "Canberra is the capital. Sydney is the largest city but not the capital.",
      "order": 1
    },
    {
      "questionType": 2,
      "prompt": "Which continents does the equator cross?",
      "content": {"options": ["Africa", "South America", "Asia", "Europe"], "correct_indices": [0, 1, 2]},
      "order": 2
    },
    {
      "questionType": 2,
      "prompt": "Which ocean is the largest?",
      "content": {"options": ["Atlantic", "Pacific", "Indian", "Arctic"], "correct_indices": [1]},
      "explanation": "The Pacific Ocean covers more area than all landmasses combined.",
      "order": 3
    },
    {
      "questionType": 1,
      "prompt": "What is the capital of France?",
      "content": {"answers": ["Paris", "paris"]},
      "order": 4
    },
    {
      "questionType": 1,
      "prompt": "What is the longest river in the world?",
      "content": {"answers": ["Nile", "nile", "the nile", "rio nilo"]},
      "hint": "Its in Africa",
      "explanation": "The Nile flows through northeastern Africa, approximately 6,650 km long.",
      "order": 5
    }
  ]
}' | jq -r '.id')
echo "$TEST2"

# ============================================================
# Test 3: Spanish Basics (MC only)
# ============================================================
echo -n "Creating test: Spanish Basics — Multiple Choice... "
TEST3=$(post "$API/tests" '{
  "title": "Spanish Basics — Multiple Choice",
  "description": "Vocabulary and grammar basics, multiple choice only",
  "questions": [
    {
      "questionType": 2,
      "prompt": "Which of these means \"thank you\" in Spanish?",
      "content": {"options": ["Gracias", "Por favor", "De nada", "Lo siento"], "correct_indices": [0]},
      "explanation": "\"Gracias\" means \"thank you\". \"Por favor\" is \"please\", \"de nada\" is \"you'\''re welcome\", and \"lo siento\" is \"I'\''m sorry\".",
      "order": 0
    },
    {
      "questionType": 2,
      "prompt": "Which of these are colors in Spanish?",
      "content": {"options": ["Rojo", "Mesa", "Azul", "Silla"], "correct_indices": [0, 2]},
      "hint": "\"Mesa\" and \"silla\" are pieces of furniture",
      "explanation": "\"Rojo\" (red) and \"azul\" (blue) are colors. \"Mesa\" means table and \"silla\" means chair.",
      "order": 1
    },
    {
      "questionType": 2,
      "prompt": "Which of these are Spanish definite articles (\"the\")?",
      "content": {"options": ["El", "La", "Los", "Un"], "correct_indices": [0, 1, 2]},
      "hint": "\"Un\" is an indefinite article, not a definite one",
      "explanation": "\"El\", \"la\", and \"los\" are definite articles (\"the\"). \"Un\" is an indefinite article (\"a/an\").",
      "order": 2
    },
    {
      "questionType": 2,
      "prompt": "Which of these are days of the week in Spanish?",
      "content": {"options": ["Lunes", "Enero", "Martes", "Verano"], "correct_indices": [0, 2]},
      "explanation": "\"Lunes\" (Monday) and \"martes\" (Tuesday) are days of the week. \"Enero\" is a month and \"verano\" is a season.",
      "order": 3
    },
    {
      "questionType": 2,
      "prompt": "What is the correct conjugation of \"ser\" for \"yo\" (I am)?",
      "content": {"options": ["Soy", "Eres", "Es", "Somos"], "correct_indices": [0]},
      "hint": "Think of the phrase \"yo ___ estudiante\"",
      "explanation": "\"Soy\" is the first-person singular form of \"ser\". \"Eres\" is for \"tu\", \"es\" for \"el/ella\", and \"somos\" for \"nosotros\".",
      "order": 4
    },
    {
      "questionType": 2,
      "prompt": "Which of these are numbers in Spanish?",
      "content": {"options": ["Tres", "Perro", "Cinco", "Azul"], "correct_indices": [0, 2]},
      "hint": "\"Perro\" and \"azul\" are not numbers",
      "explanation": "\"Tres\" (three) and \"cinco\" (five) are numbers. \"Perro\" means dog and \"azul\" means blue.",
      "order": 5
    }
  ]
}' | jq -r '.id')
echo "$TEST3"

# ============================================================
# Test 4: History 2º ESO — Long Text Questions (AI-graded)
# ============================================================
echo -n "Creating test: History 2º ESO — Long Text Exam... "
TEST4=$(post "$API/tests" "$(cat <<'EOF'
{
  "title": "History 2º ESO — Long Text Exam",
  "description": "Development questions on ancient and medieval history. AI-graded against rubric criteria.",
  "questions": [
    {
      "questionType": 3,
      "order": 0,
      "prompt": "Explain the Roman Civil Wars between Julius Caesar, Pompey, and the events that led to the fall of the Roman Republic and the rise of the Empire. Cover the key political context, the main battles and turning points, and the final outcome. (~8-10 lines)",
      "points": 1.0,
      "content": {
        "length_limit": 2,
        "rubric": [
          {
            "point": "Identifies the political crisis of the late Roman Republic as the backdrop (collapse of traditional institutions, Senate's loss of authority)",
            "weight": 0.15,
            "category": "Context & Causes"
          },
          {
            "point": "Names the First Triumvirate (Caesar, Pompey, Crassus) and explains its role in destabilising the Republic",
            "weight": 0.10,
            "category": "Context & Causes"
          },
          {
            "point": "Mentions Caesar crossing the Rubicon (49 BC) and explains its significance as the formal outbreak of the war against Pompey and the Senate",
            "weight": 0.15,
            "category": "Key Events"
          },
          {
            "point": "Refers to the Battle of Pharsalus (48 BC) as the decisive defeat of Pompey's forces by Caesar",
            "weight": 0.10,
            "category": "Key Events"
          },
          {
            "point": "Notes Pompey's flight to Egypt and his assassination there (48 BC)",
            "weight": 0.05,
            "category": "Key Events"
          },
          {
            "point": "Mentions Caesar's assassination on the Ides of March (44 BC) and identifies it as the trigger for the next phase of civil war",
            "weight": 0.10,
            "category": "Key Events"
          },
          {
            "point": "Explains the formation of the Second Triumvirate (Mark Antony, Octavian, Lepidus) following Caesar's death and its role in the subsequent wars",
            "weight": 0.10,
            "category": "Key Events"
          },
          {
            "point": "Describes Octavian's final victory (Battle of Actium, 31 BC) over Mark Antony and Cleopatra, and Lepidus's marginalisation",
            "weight": 0.15,
            "category": "Outcomes & Significance"
          },
          {
            "point": "Connects the end of the civil wars to the fall of the Roman Republic and the establishment of the Principate / Roman Empire under Augustus",
            "weight": 0.10,
            "category": "Outcomes & Significance"
          }
        ]
      }
    },
    {
      "questionType": 3,
      "order": 1,
      "prompt": "Describe the feudal system in medieval Europe. Explain its social structure, the obligations between lords and vassals, and the role of peasants and serfs. Why did this system emerge, and what were its main strengths and weaknesses? (~8-10 lines)",
      "points": 1.0,
      "content": {
        "length_limit": 2,
        "rubric": [
          {
            "point": "Explains that feudalism emerged after the fall of the Carolingian Empire / collapse of central authority, as a response to Viking, Magyar, and Saracen invasions",
            "weight": 0.10,
            "category": "Origins"
          },
          {
            "point": "Describes the hierarchical structure: king → nobles/lords → knights → peasants/serfs",
            "weight": 0.15,
            "category": "Social Structure"
          },
          {
            "point": "Defines the lord-vassal relationship: the lord grants a fief (land) in exchange for military service and loyalty",
            "weight": 0.15,
            "category": "Social Structure"
          },
          {
            "point": "Explains the role of serfs: bound to the land, worked the lord's fields, owed labour and a share of their harvest, had limited freedoms",
            "weight": 0.15,
            "category": "Social Structure"
          },
          {
            "point": "Mentions the manor as the basic economic unit of feudalism (self-sufficient estate)",
            "weight": 0.10,
            "category": "Economy"
          },
          {
            "point": "Identifies a strength: provided local order, protection, and military defence in the absence of a strong central state",
            "weight": 0.15,
            "category": "Evaluation"
          },
          {
            "point": "Identifies a weakness: rigid social immobility, exploitation of peasants, fragmentation of political power, slow economic development",
            "weight": 0.15,
            "category": "Evaluation"
          },
          {
            "point": "Notes the role of the Church as a parallel power structure in medieval feudal society",
            "weight": 0.05,
            "category": "Evaluation"
          }
        ]
      }
    },
    {
      "questionType": 3,
      "order": 2,
      "prompt": "Explain the main causes and consequences of the fall of the Western Roman Empire (476 AD). What internal and external factors contributed to its collapse, and how did it reshape Europe? (~6-8 lines)",
      "points": 1.0,
      "content": {
        "length_limit": 1,
        "rubric": [
          {
            "point": "Identifies internal factors: political instability, corruption, frequent changes of emperor, division of the Empire (East/West)",
            "weight": 0.15,
            "category": "Internal Causes"
          },
          {
            "point": "Mentions economic decline: heavy taxation, reliance on slave labour, trade disruption, debasement of currency",
            "weight": 0.15,
            "category": "Internal Causes"
          },
          {
            "point": "Mentions military weakness: overreliance on mercenaries (foederati), difficulty defending long borders",
            "weight": 0.10,
            "category": "Internal Causes"
          },
          {
            "point": "Identifies external pressure: barbarian invasions (Visigoths, Vandals, Huns, Ostrogoths) as a major factor",
            "weight": 0.15,
            "category": "External Causes"
          },
          {
            "point": "Names the deposition of Romulus Augustulus by Odoacer in 476 AD as the traditional end date",
            "weight": 0.10,
            "category": "Key Events"
          },
          {
            "point": "Notes that the Eastern Roman Empire (Byzantine) survived and continued for nearly a thousand years",
            "weight": 0.10,
            "category": "Consequences"
          },
          {
            "point": "Describes the fragmentation of Western Europe into smaller Germanic kingdoms",
            "weight": 0.15,
            "category": "Consequences"
          },
          {
            "point": "Connects the fall to the beginning of the Middle Ages / Early Medieval period",
            "weight": 0.10,
            "category": "Consequences"
          }
        ]
      }
    }
  ]
}
EOF
)")

TEST4_ID=$(echo "$TEST4" | jq -r '.id // empty')
if [ -z "$TEST4_ID" ]; then
  echo "FAILED"
  echo "$TEST4" | jq .
  exit 1
fi
echo "$TEST4_ID"

Q_COUNT=$(echo "$TEST4" | jq '.questions | length')

# Extract question IDs in order (same order as the test definition above)
Q4_ROMAN=$(echo "$TEST4" | jq -r '.questions[0].id')
Q4_FEUDAL=$(echo "$TEST4" | jq -r '.questions[1].id')
Q4_FALL=$(echo "$TEST4" | jq -r '.questions[2].id')

# ============================================================
# Submit History test with pre-written answers
# ============================================================
echo -n "Submitting History test result... "
RESULT4=$(post "$API/tests/$TEST4_ID/submit" "$(cat <<EOF
{
  "answers": [
    {"questionId": "$Q4_ROMAN", "userAnswer": "The fall of the Roman Republic was accelerated by the First Triumvirate—an informal, uneasy political alliance formed in 60 BC between Julius Caesar, Pompey the Great, and Crassus. This alliance bypassed the Senate, but it fractured when Crassus died fighting the Parthians and Caesar's daughter Julia (Pompey's wife) died in childbirth. Politically isolated, Pompey aligned with traditionalist senators who feared Caesar's growing ambition. When the Senate ordered Caesar to disband his army, he refused, famously crossing the Rubicon river with his Thirteenth Legion in 49 BC, plunging Rome into civil war.\n\nCaesar's lightning-fast invasion caught the Senate unprepared. Pompey fled to Greece to consolidate a massive army, but Caesar pursued him and won a definitive tactical victory at the Battle of Pharsalus in 48 BC. Pompey fled to Egypt, where he was betrayed and assassinated by advisors to Pharaoh Ptolemy XIII. Caesar, arriving soon after, aligned with Cleopatra and spent the next few years systematically eliminating the remaining senatorial resistance across the Mediterranean.\n\nUpon returning to Rome, Caesar consolidated absolute authority. In early 44 BC, the Senate named him dictator perpetuo (dictator in perpetuity). This flagrant violation of republican tradition drove a group of senators, led by Brutus and Cassius, to assassinate Caesar on the Ides of March (44 BC). Instead of saving the Republic, this triggered a power vacuum. Caesar's adopted heir, Octavian, and general Mark Antony formed the Second Triumvirate, defeated the assassins, and then turned on each other. Octavian decisively crushed the combined forces of Antony and Cleopatra at the naval Battle of Actium in 31 BC. By 27 BC, Octavian took the title Augustus, becoming Rome's first Emperor."},
    {"questionId": "$Q4_FEUDAL", "userAnswer": "The feudal system emerged across Western Europe between the 8th and 10th centuries out of absolute necessity. Following the collapse of the Carolingian Empire, central authority vanished, leaving Europe entirely defenseless against terrifying, rapid raids by Vikings, Magyars, and Saracens. Because monarchs lacked the treasury or standing armies to defend vast territories, power fragmented. Authority devolved to local warlords who could construct fortified castles and field immediate local military defense.\n\nAt its core, feudalism was a social pyramid bound by reciprocal legal, military, and economic obligations based on the control of land (fiefs). The relationship between a lord and a vassal was finalized through a solemn oath of fealty. In exchange for land, the vassal promised military service (typically 40 days a year) and counsel in the lord's court. The vassal then ruled over their own manor.\n\nAt the bottom of this pyramid sat the peasants and serfs. While some peasants were legally free, the vast majority were serfs. Serfs were not slaves—they could not be bought or sold away from the land—but they were legally bound to the estate. They were forced to farm the lord's personal land, pay heavy taxes in grain or livestock, and pay fees to use the lord's mill and oven. In return, the lord provided them with a small plot to feed their families and physical protection inside the castle walls during times of war.\n\nStrengths: It successfully restored localized order, safety, and self-sufficiency when central states failed.\nWeaknesses: It created intense political fragmentation, as conflicting vassal loyalties caused endless private wars. It also enforced severe social stagnation, locking the vast majority of the population into inherited, generational poverty."},
    {"questionId": "$Q4_FALL", "userAnswer": "The Western Roman Empire fell in 476 AD due to internal decay and external pressure. Internally, political instability, civil wars, rampant inflation, and a reliance on unreliable mercenary armies crippled the state. Externally, migrating Germanic tribes pressured by the Huns shattered Rome's borders. The collapse splintered Europe into localized Germanic kingdoms, ending centralized ancient rule, disrupting trade, and allowing the Catholic Church to emerge as the primary unifying cultural force"}
  ]
}
EOF
)")

RESULT4_ID=$(echo "$RESULT4" | jq -r '.id // empty')
if [ -z "$RESULT4_ID" ]; then
  echo "FAILED"
  echo "$RESULT4" | jq . 2>/dev/null || echo "$RESULT4"
else
  echo "$RESULT4_ID"

  # Patch answers with pre-computed AI grading rubric results (bypasses needing API keys)
  echo -n "Patching grading results... "
  docker exec -i backend python3 - "$RESULT4_ID" "$Q4_ROMAN" "$Q4_FEUDAL" "$Q4_FALL" < "$(dirname "$0")/patch_grading.py" 2>&1 | grep -v "INFO\|sqlalchemy"
fi

# ============================================================
# Submit Spanish Vocabulary test with sample answers
# ============================================================
echo -n "Submitting Spanish Vocabulary test result... "
# Get question IDs from the created test
Q1_HELLO=$(echo "$TEST1" | jq -r '.questions[] | select(.prompt | contains("hello")) | .id')
Q1_TOGO=$(echo "$TEST1" | jq -r '.questions[] | select(.prompt | contains("to go")) | .id')
Q1_CAT=$(echo "$TEST1" | jq -r '.questions[] | select(.prompt | contains("cat")) | .id')
Q1_HOUSE=$(echo "$TEST1" | jq -r '.questions[] | select(.prompt | contains("house")) | .id')
Q1_THANKS=$(echo "$TEST1" | jq -r '.questions[] | select(.prompt | contains("thank you")) | .id')
Q1_WATER=$(echo "$TEST1" | jq -r '.questions[] | select(.prompt | contains("water")) | .id')
# Group questions
Q1_MOTHER=$(echo "$TEST1" | jq -r '.questionGroups[0].questions[] | select(.prompt | contains("mother")) | .id')
Q1_FATHER=$(echo "$TEST1" | jq -r '.questionGroups[0].questions[] | select(.prompt | contains("father")) | .id')
Q1_BROTHER=$(echo "$TEST1" | jq -r '.questionGroups[0].questions[] | select(.prompt | contains("brother")) | .id')
Q1_SISTER=$(echo "$TEST1" | jq -r '.questionGroups[0].questions[] | select(.prompt | contains("sister")) | .id')

RESULT1=$(post "$API/tests/$TEST1_ID/submit" "$(cat <<EOF
{
  "answers": [
    {"questionId": "$Q1_HELLO", "userAnswer": "hola"},
    {"questionId": "$Q1_TOGO", "userAnswer": "ir"},
    {"questionId": "$Q1_CAT", "userAnswer": "perro"},
    {"questionId": "$Q1_HOUSE", "userAnswer": "casa"},
    {"questionId": "$Q1_THANKS", "userAnswer": "gracias"},
    {"questionId": "$Q1_WATER", "userAnswer": "agua"},
    {"questionId": "$Q1_MOTHER", "userAnswer": "madre"},
    {"questionId": "$Q1_FATHER", "userAnswer": "papa"},
    {"questionId": "$Q1_BROTHER", "userAnswer": "hermano"},
    {"questionId": "$Q1_SISTER", "userAnswer": "hermana"}
  ]
}
EOF
)")

RESULT1_ID=$(echo "$RESULT1" | jq -r '.id // empty')
if [ -z "$RESULT1_ID" ]; then
  echo "FAILED"
  echo "$RESULT1" | jq . 2>/dev/null || echo "$RESULT1"
else
  echo "$RESULT1_ID (score: $(echo "$RESULT1" | jq '.score')%)"
fi

echo ""
echo "=== Seed complete ==="
echo "User:  $EMAIL / $PASSWORD"
echo "Tests: $TEST1_ID, $TEST2, $TEST3, $TEST4_ID"
echo "Results: $RESULT1_ID (Spanish), $RESULT4_ID (History)"
echo "Total: $(( 6 + 6 + 6 )) Simple/MC questions + 4 grouped questions + $Q_COUNT Long Text questions"
echo ""
echo "Log in at http://localhost:3000 with these credentials."

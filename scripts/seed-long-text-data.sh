#!/usr/bin/env bash
# Seed script for testing AI grading of Long Text questions.
# Creates a test with rubric-based Long Text questions covering different topics.
#
# Usage: bash scripts/seed-long-text-data.sh
# Requires: curl, jq, backend running at localhost:8000

set -euo pipefail

API="http://localhost:8000/api/v1"
COOKIE_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR"' EXIT

EMAIL="reviewer@test.com"
PASSWORD="Test1234!"

echo "=== Seeding Long Text test data ==="

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

post() {
  curl -s -b "$COOKIE_JAR" -X POST "$1" -H "Content-Type: application/json" -d "$2"
}

# ============================================================
# Test: History 2º ESO — Long Text Questions
# ============================================================
echo -n "Creating test: History 2º ESO... "
TEST=$(post "$API/tests" "$(cat <<'EOF'
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

TEST_ID=$(echo "$TEST" | jq -r '.id // empty')
if [ -z "$TEST_ID" ]; then
  echo "FAILED"
  echo "$TEST" | jq .
  exit 1
fi
echo "created (id: $TEST_ID)"

Q_COUNT=$(echo "$TEST" | jq '.questions | length')
echo "  → $Q_COUNT Long Text questions created"
echo ""
echo "=== Done ==="
echo "Login with: $EMAIL / $PASSWORD"
echo "Test ID: $TEST_ID"

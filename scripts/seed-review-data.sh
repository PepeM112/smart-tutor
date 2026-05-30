#!/usr/bin/env bash
# Seed script for SP-17 review testing.
# Creates a test user and two tests with a mix of Simple and MC questions
# covering correct, wrong, partial, hints, and explanations.
#
# Usage: bash scripts/seed-review-data.sh
# Requires: curl, jq, backend running at localhost:8000

set -euo pipefail

API="http://localhost:8000/api/v1"
COOKIE_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR"' EXIT

EMAIL="reviewer@test.com"
PASSWORD="Test1234!"

echo "=== Seeding review test data ==="

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
  ]
}' | jq -r '.id')
echo "$TEST1"

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

echo ""
echo "=== Seed complete ==="
echo "User:  $EMAIL / $PASSWORD"
echo "Tests: $TEST1, $TEST2"
echo "Total: 12 questions (8 Simple, 4 MC)"
echo ""
echo "Log in at http://localhost:3000 with these credentials,"
echo "then go to /review to start testing."

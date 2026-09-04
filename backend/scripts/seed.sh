#!/usr/bin/env bash
# Seed script — creates a test user and populates sample data.
#
# Usage: bash scripts/seed.sh
# Requires: curl, backend running at localhost:8000

set -euo pipefail

API="http://localhost:8000/api/v1"
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

# --- Seed all data via ORM ---
docker exec -e PYTHONPATH=/app backend python3 /app/scripts/seed.py "$EMAIL"

echo ""
echo "User:  $EMAIL / $PASSWORD"
echo "Log in at http://localhost:3000 with these credentials."

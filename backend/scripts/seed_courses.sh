#!/usr/bin/env bash
# Seed courses for browser testing. Run `make seed` first (it makes the owner and the personal content).
#
# Usage: bash scripts/seed_courses.sh
# Requires: curl, backend running at localhost:8000

set -euo pipefail

API="http://localhost:8000/api/v1"
PASSWORD="Test1234!"
OWNER="reviewer@test.com"

echo "=== Seeding course test data ==="

# --- Register the extra users (ignore 400 if they already exist) ---
for NAME in editor viewer outsider; do
  echo -n "Creating user $NAME... "
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$API/users/signup" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$NAME\",\"email\":\"$NAME@test.com\",\"password\":\"$PASSWORD\"}")
  if [ "$STATUS" = "201" ]; then echo "created"; else echo "already exists (${STATUS})"; fi
done

docker exec -e PYTHONPATH=/app backend python3 /app/scripts/seed_courses.py \
  "$OWNER" editor@test.com viewer@test.com outsider@test.com

echo ""
echo "Users (password $PASSWORD): $OWNER (owner), editor@test.com, viewer@test.com, outsider@test.com"

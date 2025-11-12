#!/bin/bash
# This file can be double-clicked on Mac to run in Terminal

cd "$(dirname "$0")"

echo "🔧 Vercel Environment Variable Setup (Local)"
echo "=============================================="
echo ""
echo "This script will set up your Vercel environment variables."
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
  echo "❌ Error: .env.local file not found!"
  echo "   Make sure you're in the correct directory."
  exit 1
fi

echo "Please enter your Vercel token:"
echo "(Get it from: https://vercel.com/account/tokens)"
echo ""
read -sp "Token: " VERCEL_TOKEN
echo ""
echo ""

if [ -z "$VERCEL_TOKEN" ]; then
  echo "❌ No token provided!"
  exit 1
fi

# Test token
echo "Testing token..."
USER_INFO=$(curl -s "https://api.vercel.com/v2/user" \
  -H "Authorization: Bearer $VERCEL_TOKEN")

if echo "$USER_INFO" | grep -q "username"; then
  USERNAME=$(echo "$USER_INFO" | grep -o '"username":"[^"]*"' | cut -d'"' -f4)
  echo "✅ Token valid! Logged in as: $USERNAME"
else
  echo "❌ Token validation failed!"
  echo "Response: $USER_INFO"
  echo ""
  echo "Please create a new token with 'Full Account' scope at:"
  echo "https://vercel.com/account/tokens"
  exit 1
fi

echo ""

# Get project ID
echo "Finding project ID..."
PROJECTS=$(curl -s "https://api.vercel.com/v9/projects" \
  -H "Authorization: Bearer $VERCEL_TOKEN")

PROJECT_ID=$(echo "$PROJECTS" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    projects = data.get('projects', [])
    for p in projects:
        if p.get('name') == 'nodejs':
            print(p.get('id', ''))
            break
except:
    pass
" 2>/dev/null)

if [ -z "$PROJECT_ID" ]; then
  echo "❌ Could not find 'nodejs' project!"
  echo ""
  echo "Available projects:"
  echo "$PROJECTS" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for p in data.get('projects', []):
        print(f\"  - {p.get('name')}\")
except:
    print('  (Could not parse projects)')
"
  exit 1
fi

echo "✅ Found project: $PROJECT_ID"
echo ""

# Read and add environment variables
echo "Adding environment variables..."
echo ""

SUCCESS_COUNT=0
SKIP_COUNT=0
FAIL_COUNT=0

while IFS='=' read -r key value; do
  # Skip comments and empty lines
  [[ $key =~ ^#.*$ ]] && continue
  [[ -z $key ]] && continue
  [[ $key =~ ^[[:space:]]*$ ]] && continue

  # Clean key and value
  key=$(echo "$key" | xargs)
  value=$(echo "$value" | sed 's/^"\(.*\)"$/\1/' | sed "s/^'\(.*\)'$/\1/")

  [ -z "$value" ] && continue

  echo -n "  $key ... "

  # Add to Vercel
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "https://api.vercel.com/v10/projects/$PROJECT_ID/env" \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"key\": \"$key\",
      \"value\": $(echo "$value" | python3 -c "import sys, json; print(json.dumps(sys.stdin.read().strip()))"),
      \"type\": \"encrypted\",
      \"target\": [\"production\", \"preview\", \"development\"]
    }")

  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    echo "✅"
    ((SUCCESS_COUNT++))
  elif echo "$RESPONSE" | grep -qi "already exists"; then
    echo "⚠️  (already exists)"
    ((SKIP_COUNT++))
  else
    echo "❌ HTTP $HTTP_CODE"
    ((FAIL_COUNT++))
  fi

done < .env.local

echo ""
echo "Results:"
echo "  ✅ Added: $SUCCESS_COUNT"
echo "  ⚠️  Skipped: $SKIP_COUNT"
echo "  ❌ Failed: $FAIL_COUNT"
echo ""

if [ $SUCCESS_COUNT -gt 0 ] || [ $SKIP_COUNT -gt 0 ]; then
  echo "Triggering new deployment..."

  curl -s -X POST "https://api.vercel.com/v13/deployments" \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "name": "nodejs",
      "gitSource": {
        "type": "github",
        "ref": "claude/fitness-coach-ai-clone-011CV33t6bRy52gR1obe3L4j"
      }
    }' > /dev/null

  echo ""
  echo "🚀 Deployment triggered!"
  echo ""
  echo "⏱️  Wait 2-3 minutes, then visit:"
  echo "   https://nodejs-git-claude-fitness-coach-10be17-chris-lanzillis-projects.vercel.app"
  echo ""
  echo "✅ Setup complete!"
else
  echo "❌ No variables were added. Please check the errors above."
fi

echo ""
read -p "Press Enter to close..."

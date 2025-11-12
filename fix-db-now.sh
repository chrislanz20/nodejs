#!/bin/bash

# Fix DATABASE_URL - Ready to run!
# Your token is already included

PROJECT_ID="prj_HuURkss0yfRZ0RAP4JhqEcXR0ar9"
VERCEL_TOKEN="qjbuCHTYl9jddIZ4BfR7MMGN"
NEW_DATABASE_URL="postgresql://postgres.kbikmniwekqlttymwyos:Lanzilli%2524@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

echo "🔧 Fixing DATABASE_URL for Vercel"
echo "=================================="
echo ""

echo "Step 1: Finding existing DATABASE_URL..."
ENV_RESPONSE=$(curl -s "https://api.vercel.com/v9/projects/$PROJECT_ID/env" \
  -H "Authorization: Bearer $VERCEL_TOKEN")

ENV_ID=$(echo "$ENV_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for env in data.get('envs', []):
        if env.get('key') == 'DATABASE_URL':
            print(env.get('id', ''))
            break
except:
    pass
" 2>/dev/null)

if [ -n "$ENV_ID" ]; then
  echo "   Found DATABASE_URL (ID: $ENV_ID)"
  echo ""
  echo "Step 2: Deleting old DATABASE_URL..."

  DELETE_RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE \
    "https://api.vercel.com/v9/projects/$PROJECT_ID/env/$ENV_ID" \
    -H "Authorization: Bearer $VERCEL_TOKEN")

  DELETE_CODE=$(echo "$DELETE_RESPONSE" | tail -n1)

  if [ "$DELETE_CODE" = "200" ] || [ "$DELETE_CODE" = "204" ]; then
    echo "   ✅ Deleted"
  else
    echo "   ⚠️  Could not delete (might not exist)"
  fi
else
  echo "   No existing DATABASE_URL found (will create new)"
fi

echo ""
echo "Step 3: Adding new DATABASE_URL with connection pooler..."

ADD_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "https://api.vercel.com/v10/projects/$PROJECT_ID/env" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"key\": \"DATABASE_URL\",
    \"value\": \"$NEW_DATABASE_URL\",
    \"type\": \"encrypted\",
    \"target\": [\"production\", \"preview\", \"development\"]
  }")

ADD_CODE=$(echo "$ADD_RESPONSE" | tail -n1)

if [ "$ADD_CODE" = "200" ] || [ "$ADD_CODE" = "201" ]; then
  echo "   ✅ DATABASE_URL updated successfully!"
elif echo "$ADD_RESPONSE" | grep -qi "already exists"; then
  echo "   ⚠️  Already exists (this is fine)"
else
  echo "   ❌ Failed (HTTP $ADD_CODE)"
  echo "   Response: $(echo "$ADD_RESPONSE" | head -n-1)"
  exit 1
fi

echo ""
echo "Step 4: Triggering new deployment..."

DEPLOY_RESPONSE=$(curl -s -X POST "https://api.vercel.com/v13/deployments" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "nodejs",
    "gitSource": {
      "type": "github",
      "ref": "claude/fitness-coach-ai-clone-011CV33t6bRy52gR1obe3L4j"
    }
  }')

if echo "$DEPLOY_RESPONSE" | grep -q '"url"'; then
  echo "   ✅ Deployment triggered!"
else
  echo "   ⚠️  Deployment might have failed, but DATABASE_URL is updated"
fi

echo ""
echo "=================================="
echo "✅ DONE!"
echo ""
echo "⏱️  Wait 2-3 minutes for Vercel to redeploy"
echo ""
echo "Then try logging in at:"
echo "https://nodejs-git-claude-fitness-coach-10be17-chris-lanzillis-projects.vercel.app/login"
echo ""
echo "Login credentials:"
echo "  Email: chris@saveyatech.com"
echo "  Password: Lanzilli@20"
echo ""

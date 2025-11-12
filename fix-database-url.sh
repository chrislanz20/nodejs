#!/bin/bash

# Fix Vercel DATABASE_URL to use connection pooler

PROJECT_ID="prj_HuURkss0yfRZ0RAP4JhqEcXR0ar9"
NEW_DATABASE_URL="postgresql://postgres.kbikmniwekqlttymwyos:Lanzilli%2524@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

echo "🔧 Fixing DATABASE_URL for Vercel"
echo "=================================="
echo ""
read -sp "Paste your Vercel token: " VERCEL_TOKEN
echo ""
echo ""

if [ -z "$VERCEL_TOKEN" ]; then
  echo "❌ No token provided!"
  exit 1
fi

echo "Finding existing DATABASE_URL environment variable..."

# Get all env vars
ENV_RESPONSE=$(curl -s "https://api.vercel.com/v9/projects/$PROJECT_ID/env" \
  -H "Authorization: Bearer $VERCEL_TOKEN")

# Find the DATABASE_URL env var ID
ENV_ID=$(echo "$ENV_RESPONSE" | grep -B5 '"key":"DATABASE_URL"' | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$ENV_ID" ]; then
  echo "Found DATABASE_URL (ID: $ENV_ID)"
  echo "Deleting old DATABASE_URL..."

  curl -s -X DELETE \
    "https://api.vercel.com/v9/projects/$PROJECT_ID/env/$ENV_ID" \
    -H "Authorization: Bearer $VERCEL_TOKEN" > /dev/null

  echo "✅ Deleted"
else
  echo "No existing DATABASE_URL found"
fi

echo ""
echo "Adding new DATABASE_URL with connection pooler..."

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "https://api.vercel.com/v10/projects/$PROJECT_ID/env" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"key\": \"DATABASE_URL\",
    \"value\": \"$NEW_DATABASE_URL\",
    \"type\": \"encrypted\",
    \"target\": [\"production\", \"preview\", \"development\"]
  }")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
  echo "✅ DATABASE_URL updated successfully!"
else
  echo "❌ Failed (HTTP $HTTP_CODE)"
  echo "$RESPONSE"
  exit 1
fi

echo ""
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
echo "🚀 Done! Wait 2-3 minutes, then try logging in at:"
echo "   https://nodejs-git-claude-fitness-coach-10be17-chris-lanzillis-projects.vercel.app/login"
echo ""
echo "Login with:"
echo "   Email: chris@saveyatech.com"
echo "   Password: Lanzilli@20"

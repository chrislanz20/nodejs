#!/bin/bash

set -e  # Exit on any error

echo "🔧 Vercel Environment Variable Setup"
echo "====================================="
echo ""
echo "This script will automatically:"
echo "1. Find your Vercel project ID"
echo "2. Add all environment variables from .env.local"
echo "3. Trigger a fresh deployment"
echo ""
echo "You need a Vercel Access Token with FULL ACCESS."
echo "Get it from: https://vercel.com/account/tokens"
echo ""
echo "IMPORTANT: When creating the token, select 'Full Account' scope!"
echo ""
read -p "Paste your Vercel token here: " VERCEL_TOKEN
echo ""

if [ -z "$VERCEL_TOKEN" ]; then
  echo "❌ Error: No token provided!"
  exit 1
fi

# Test token validity
echo "Testing token..."
USER_RESPONSE=$(curl -s -w "\n%{http_code}" "https://api.vercel.com/v2/user" \
  -H "Authorization: Bearer $VERCEL_TOKEN")
HTTP_CODE=$(echo "$USER_RESPONSE" | tail -n1)

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ Error: Token is invalid or expired!"
  echo "Response: $(echo "$USER_RESPONSE" | head -n-1)"
  echo ""
  echo "Please create a new token with 'Full Account' scope at:"
  echo "https://vercel.com/account/tokens"
  exit 1
fi

echo "✅ Token is valid!"
echo ""

# Get project ID for 'nodejs' project
echo "Finding Vercel project ID..."
PROJECTS_RESPONSE=$(curl -s "https://api.vercel.com/v9/projects" \
  -H "Authorization: Bearer $VERCEL_TOKEN")

# Extract project ID using grep and sed
PROJECT_ID=$(echo "$PROJECTS_RESPONSE" | grep -o '"name":"nodejs"[^}]*"id":"[^"]*"' | sed 's/.*"id":"\([^"]*\)".*/\1/' | head -1)

if [ -z "$PROJECT_ID" ]; then
  echo "❌ Error: Could not find 'nodejs' project!"
  echo "Available projects:"
  echo "$PROJECTS_RESPONSE" | grep -o '"name":"[^"]*"' | sed 's/"name":"/  - /' | sed 's/"$//'
  exit 1
fi

echo "✅ Found project ID: $PROJECT_ID"
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
  echo "❌ Error: .env.local file not found!"
  exit 1
fi

# Function to add env var
add_env() {
  local key=$1
  local value=$2

  echo "  Adding $key..."

  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "https://api.vercel.com/v10/projects/$PROJECT_ID/env" \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"key\": \"$key\",
      \"value\": \"$value\",
      \"type\": \"encrypted\",
      \"target\": [\"production\", \"preview\", \"development\"]
    }")

  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    echo "    ✅ Added successfully"
  elif echo "$RESPONSE" | grep -q "already exists"; then
    echo "    ⚠️  Already exists, skipping"
  else
    echo "    ⚠️  Warning: HTTP $HTTP_CODE"
  fi
}

# Add all env vars from .env.local
echo "Adding environment variables from .env.local..."
echo ""

while IFS='=' read -r key value; do
  # Skip comments, empty lines, and lines without =
  [[ $key =~ ^#.*$ ]] && continue
  [[ -z $key ]] && continue
  [[ $key =~ ^[[:space:]]*$ ]] && continue

  # Trim whitespace from key
  key=$(echo "$key" | xargs)

  # Remove quotes from value and trim whitespace
  value=$(echo "$value" | sed 's/^"\(.*\)"$/\1/' | sed "s/^'\(.*\)'$/\1/" | xargs)

  # Skip if value is empty
  [ -z "$value" ] && continue

  # Add to Vercel
  add_env "$key" "$value"
done < .env.local

echo ""
echo "✅ All environment variables added!"
echo ""
echo "Now triggering a fresh deployment..."
echo ""

# Trigger redeploy
DEPLOY_RESPONSE=$(curl -s -X POST "https://api.vercel.com/v13/deployments" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"nodejs\",
    \"gitSource\": {
      \"type\": \"github\",
      \"ref\": \"claude/fitness-coach-ai-clone-011CV33t6bRy52gR1obe3L4j\"
    }
  }")

DEPLOY_URL=$(echo "$DEPLOY_RESPONSE" | grep -o '"url":"[^"]*"' | head -1 | sed 's/"url":"//' | sed 's/"$//')

echo ""
echo "🚀 Deployment triggered!"
if [ -n "$DEPLOY_URL" ]; then
  echo "   URL: https://$DEPLOY_URL"
fi
echo ""
echo "⏱️  Wait 2-3 minutes, then check:"
echo "   https://nodejs-git-claude-fitness-coach-10be17-chris-lanzillis-projects.vercel.app"
echo ""
echo "✅ Setup complete!"

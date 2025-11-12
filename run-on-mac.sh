#!/bin/bash

# Vercel Environment Setup Script
# Run this on your Mac terminal

PROJECT_ID="prj_HuURkss0yfRZ0RAP4JhqEcXR0ar9"

echo "🔧 Setting up Vercel Environment Variables"
echo "=========================================="
echo ""
echo "Project ID: $PROJECT_ID"
echo ""
read -sp "Paste your Vercel token: " VERCEL_TOKEN
echo ""
echo ""

if [ -z "$VERCEL_TOKEN" ]; then
  echo "❌ No token provided!"
  exit 1
fi

# Function to add env var
add_env() {
  local key=$1
  local value=$2

  echo -n "Adding $key ... "

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
    echo "✅"
  elif echo "$RESPONSE" | grep -qi "already exists"; then
    echo "⚠️  (already exists)"
  else
    echo "❌ HTTP $HTTP_CODE"
  fi
}

# Check if .env.local exists
if [ ! -f .env.local ]; then
  echo "❌ Error: .env.local file not found!"
  echo "   Make sure you're in the correct directory."
  exit 1
fi

echo "Reading environment variables from .env.local..."
echo ""

# Read and add environment variables from .env.local
while IFS='=' read -r key value; do
  # Skip comments, empty lines, and lines without =
  [[ $key =~ ^#.*$ ]] && continue
  [[ -z $key ]] && continue
  [[ $key =~ ^[[:space:]]*$ ]] && continue

  # Clean key and value
  key=$(echo "$key" | xargs)
  value=$(echo "$value" | sed 's/^"\(.*\)"$/\1/' | sed "s/^'\(.*\)'$/\1/")

  [ -z "$value" ] && continue

  # Skip CHROMA_URL for now (not needed yet)
  [[ $key == "CHROMA_URL" ]] && continue

  # Add to Vercel
  add_env "$key" "$value"

done < .env.local

echo ""
echo "✅ Environment variables configured!"
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
echo "🚀 Deployment triggered!"
echo ""
echo "⏱️  Wait 2-3 minutes, then visit:"
echo "   https://nodejs-git-claude-fitness-coach-10be17-chris-lanzillis-projects.vercel.app"
echo ""
echo "Login with:"
echo "   Email: chris@saveyatech.com"
echo "   Password: Lanzilli@20"
echo ""
echo "✅ Done!"

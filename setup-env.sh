#!/bin/bash

echo "🔧 Vercel Environment Variable Setup"
echo "====================================="
echo ""
echo "You need your Vercel Access Token."
echo "Get it from: https://vercel.com/account/tokens"
echo ""
echo "Click 'Create' → Name it 'env-setup' → Copy the token"
echo ""
read -p "Paste your Vercel token here: " VERCEL_TOKEN
echo ""

# Get project ID
PROJECT_ID="prj_O6z3uL8K6VkJxY9X2ZQm9qR7Lw8P"  # You'll need to update this

# Function to add env var
add_env() {
  local key=$1
  local value=$2

  echo "Adding $key..."

  curl -X POST "https://api.vercel.com/v10/projects/$PROJECT_ID/env" \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"key\": \"$key\",
      \"value\": \"$value\",
      \"type\": \"encrypted\",
      \"target\": [\"production\", \"preview\", \"development\"]
    }" > /dev/null 2>&1
}

# Add all env vars
# Read from .env.local file
if [ -f .env.local ]; then
  echo "Reading variables from .env.local..."
  while IFS='=' read -r key value; do
    # Skip comments and empty lines
    [[ $key =~ ^#.*$ ]] || [[ -z $key ]] && continue
    # Remove quotes and add to Vercel
    value=$(echo "$value" | sed 's/^"\(.*\)"$/\1/')
    add_env "$key" "$value"
  done < .env.local
else
  echo "Error: .env.local file not found!"
  exit 1
fi

echo ""
echo "✅ Done! Now triggering redeploy..."
echo ""

# Trigger redeploy
curl -X POST "https://api.vercel.com/v13/deployments" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"nodejs\",
    \"gitSource\": {
      \"type\": \"github\",
      \"ref\": \"claude/fitness-coach-ai-clone-011CV33t6bRy52gR1obe3L4j\"
    }
  }"

echo ""
echo "🚀 Deployment triggered! Check Vercel in 2 minutes."

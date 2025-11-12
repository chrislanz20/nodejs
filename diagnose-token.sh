#!/bin/bash

echo "🔍 Vercel Token Diagnostic Tool"
echo "================================"
echo ""

if [ -z "$1" ]; then
  read -p "Paste your Vercel token here: " TOKEN
else
  TOKEN="$1"
fi

echo ""
echo "Testing token: ${TOKEN:0:8}...${TOKEN: -4}"
echo ""

# Test different endpoints
echo "Testing API endpoints..."
echo ""

echo "1. User Info (/v2/user):"
RESPONSE=$(curl -s -w "\n%{http_code}" "https://api.vercel.com/v2/user" \
  -H "Authorization: Bearer $TOKEN")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
  echo "   ✅ SUCCESS - Token is valid!"
  echo "   User: $(echo "$BODY" | grep -o '"username":"[^"]*"' | cut -d'"' -f4)"
  echo "   Email: $(echo "$BODY" | grep -o '"email":"[^"]*"' | cut -d'"' -f4)"
elif [ "$HTTP_CODE" = "403" ]; then
  echo "   ❌ FAILED - HTTP 403 Forbidden"
  echo "   This means the token exists but doesn't have API access permissions"
elif [ "$HTTP_CODE" = "401" ]; then
  echo "   ❌ FAILED - HTTP 401 Unauthorized"
  echo "   This means the token is invalid or expired"
else
  echo "   ❌ FAILED - HTTP $HTTP_CODE"
  echo "   Response: $BODY"
fi
echo ""

echo "2. Projects List (/v9/projects):"
RESPONSE=$(curl -s -w "\n%{http_code}" "https://api.vercel.com/v9/projects" \
  -H "Authorization: Bearer $TOKEN")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
  echo "   ✅ SUCCESS"
  PROJECT_COUNT=$(echo "$BODY" | grep -o '"name":"[^"]*"' | wc -l)
  echo "   Found $PROJECT_COUNT projects"
  echo "$BODY" | grep -o '"name":"[^"]*"' | sed 's/"name":"/     - /' | sed 's/"$//'
elif [ "$HTTP_CODE" = "403" ]; then
  echo "   ❌ FAILED - HTTP 403 Forbidden"
else
  echo "   ❌ FAILED - HTTP $HTTP_CODE"
fi
echo ""

echo "3. Teams List (/v2/teams):"
RESPONSE=$(curl -s -w "\n%{http_code}" "https://api.vercel.com/v2/teams" \
  -H "Authorization: Bearer $TOKEN")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

if [ "$HTTP_CODE" = "200" ]; then
  echo "   ✅ SUCCESS"
elif [ "$HTTP_CODE" = "403" ]; then
  echo "   ❌ FAILED - HTTP 403 Forbidden"
else
  echo "   ❌ FAILED - HTTP $HTTP_CODE"
fi
echo ""

echo "================================"
echo ""
echo "DIAGNOSIS:"
echo ""

if [ "$(curl -s -o /dev/null -w '%{http_code}' 'https://api.vercel.com/v2/user' -H "Authorization: Bearer $TOKEN")" = "200" ]; then
  echo "✅ Token is working correctly!"
  echo "   You can proceed with setup-env.sh"
elif [ "$(curl -s -o /dev/null -w '%{http_code}' 'https://api.vercel.com/v2/user' -H "Authorization: Bearer $TOKEN")" = "403" ]; then
  echo "⚠️  Token has NO API ACCESS"
  echo ""
  echo "   This happens when you create a token but it doesn't have"
  echo "   programmatic API access enabled."
  echo ""
  echo "   FIX: Create a new token at https://vercel.com/account/tokens"
  echo "   1. Click 'Create Token'"
  echo "   2. Name: 'api-access'"
  echo "   3. Scope: Select 'Full Account'"
  echo "   4. Expiration: Choose duration"
  echo "   5. Click 'Create Token'"
  echo "   6. Copy the new token and run this script again"
else
  echo "❌ Token is INVALID or EXPIRED"
  echo ""
  echo "   FIX: Create a new token at https://vercel.com/account/tokens"
fi
echo ""

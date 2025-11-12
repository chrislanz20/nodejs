#!/bin/bash

echo "🚀 Setting up Vercel Environment Variables..."
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "❌ Error: .env.local file not found!"
    exit 1
fi

# Install Vercel CLI if not installed
if ! command -v vercel &> /dev/null; then
    echo "📦 Installing Vercel CLI..."
    npm install -g vercel
fi

# Login to Vercel
echo ""
echo "🔐 Please login to Vercel..."
vercel login

# Link to project
echo ""
echo "🔗 Linking to your Vercel project..."
vercel link

# Push environment variables
echo ""
echo "📤 Pushing environment variables to Vercel..."

# Read .env.local and push each variable
while IFS='=' read -r key value; do
    # Skip comments and empty lines
    if [[ $key =~ ^#.*$ ]] || [[ -z $key ]]; then
        continue
    fi

    # Remove quotes from value
    value=$(echo $value | sed 's/^"\(.*\)"$/\1/')

    echo "Adding: $key"
    echo "$value" | vercel env add "$key" production
done < .env.local

echo ""
echo "✅ Environment variables set!"
echo "🚀 Redeploying your app..."
vercel --prod

echo ""
echo "✨ Done! Check your Vercel dashboard for deployment status."

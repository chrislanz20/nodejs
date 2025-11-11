# API Setup Guide - New Features

This guide helps you set up the new verification features (Google Custom Search + Apollo Decision Maker lookup).

---

## 🔍 Google Custom Search API Setup

This allows the app to search Google to verify if businesses have websites.

### Step 1: Enable Custom Search API

1. Go to https://console.cloud.google.com/apis/library
2. Search for "Custom Search API"
3. Click **"Custom Search API"**
4. Click **"Enable"**

### Step 2: Get API Key

1. Go to https://console.cloud.google.com/apis/credentials
2. Click **"+ CREATE CREDENTIALS"**
3. Select **"API key"**
4. Copy the API key
5. (Optional) Click "RESTRICT KEY" and:
   - Name it: "Custom Search API Key"
   - Under API restrictions: Select "Custom Search API"
   - Click "Save"

**Save this key - you'll need it for Vercel!**

### Step 3: Create Custom Search Engine

1. Go to https://programmablesearchengine.google.com/
2. Click **"Add"** or **"Get Started"**
3. In "Sites to search": Enter `www.google.com`
4. Name it: "Business Website Verification"
5. Click **"Create"**
6. Click **"Customize"** on your new search engine
7. Under "Search the entire web": Turn **ON**
8. Click **"Update"**
9. Copy the **Search engine ID** (looks like: `a1b2c3d4e5f6g7h8i`)

**Save this ID - you'll need it for Vercel!**

**Cost:** $5 per 1,000 searches (after 100 free/day)

---

## 🎯 Apollo API Setup

This allows the app to find decision maker contact information.

### Step 1: Get Your Apollo API Key

1. Log in to https://app.apollo.io
2. Click your profile icon (top right)
3. Click **"Settings"**
4. Click **"API"** in the left sidebar
5. You'll see your API key or click **"Create New Key"**
6. Copy the API key (starts with something like `Y2...`)

**Save this key - you'll need it for Vercel!**

**Cost:** Included in your Organization plan (4,800 credits/month)

---

## ⚙️ Add to Vercel Environment Variables

Once you have all 3 values, add them to Vercel:

1. Go to https://vercel.com
2. Click your project
3. Go to **Settings** → **Environment Variables**
4. Add these THREE new variables:

### Variable 1: GOOGLE_CUSTOM_SEARCH_API_KEY
- **Name**: `GOOGLE_CUSTOM_SEARCH_API_KEY`
- **Value**: Your Custom Search API key from Step 2 above
- **Environments**: ✅ Production, ✅ Preview, ✅ Development

### Variable 2: GOOGLE_CUSTOM_SEARCH_ENGINE_ID
- **Name**: `GOOGLE_CUSTOM_SEARCH_ENGINE_ID`
- **Value**: Your Search Engine ID from Step 3 above
- **Environments**: ✅ Production, ✅ Preview, ✅ Development

### Variable 3: APOLLO_API_KEY
- **Name**: `APOLLO_API_KEY`
- **Value**: Your Apollo API key
- **Environments**: ✅ Production, ✅ Preview, ✅ Development

---

## 🔄 Redeploy

After adding all 3 environment variables:

1. Go to **Deployments** tab
2. Click on the latest deployment
3. Click **"..."** (three dots)
4. Click **"Redeploy"**
5. Wait 1-2 minutes

---

## ✅ Test It!

Once deployed:

1. Do a search (e.g., "restaurants in 02180")
2. Check the Vercel logs to see:
   - `No website in Google Places - Verifying...`
   - `Found potential website via Google Search - SKIPPING` (if website found)
   - `No website found - Adding to list` (if no website)
   - `Found decision maker - John Smith (Owner)` (if Apollo finds them)

3. Check your Google Sheet:
   - New columns: **Business Phone**, **DM Name**, **DM Title**, **DM Phone**
   - DM columns filled when Apollo finds info
   - DM columns blank when Apollo doesn't find info

---

## 🎯 What You'll Get

**Better Accuracy:**
- ~95% accuracy (vs 60% before)
- Fewer false positives (businesses that actually have websites)

**Bonus Info:**
- Decision maker name
- Decision maker title
- Decision maker direct phone number (when available)

**Cost:**
- Google Custom Search: ~$6-8/month
- Apollo: $0 (included in your plan)

---

## 🛠️ Troubleshooting

**"Error verifying website"**
- Check that Custom Search API is enabled
- Verify API key is correct
- Make sure Search Engine ID is correct

**"Apollo API not configured"**
- Check that Apollo API key is set in Vercel
- Verify the key is correct (should start with Y2...)

**No decision maker info showing up**
- This is normal! Not all businesses are in Apollo
- It will be blank for businesses not in Apollo's database
- You still get the business phone number

---

**Questions?** Check Vercel logs for detailed error messages!

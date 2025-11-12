# Getting Your API Keys - Step by Step Guide

## 1. Get Anthropic API Key (for Claude AI)

**What it does:** Powers the actual AI chat responses

**Steps:**
1. Go to: https://console.anthropic.com/
2. Click "Sign In" or "Sign Up" (top right)
3. Create account with email
4. Once logged in, click "API Keys" in left sidebar
5. Click "Create Key"
6. Copy the key (starts with `sk-ant-...`)
7. **SAVE IT SOMEWHERE** - you can only see it once!

**Cost:** $5 free credit to start, then ~$3 per 1 million tokens
- For testing: FREE
- For 100 chats: ~$5-10/month

---

## 2. Get OpenAI API Key (for document search)

**What it does:** Helps find relevant training materials when users ask questions

**Steps:**
1. Go to: https://platform.openai.com/signup
2. Sign up with email
3. Go to: https://platform.openai.com/api-keys
4. Click "Create new secret key"
5. Name it "Fitness Coach AI"
6. Copy the key (starts with `sk-...`)
7. **SAVE IT SOMEWHERE** - you can only see it once!

**Cost:** $5 free credit for new accounts, then ~$0.10 per 1000 searches
- For testing: FREE
- For 1000 chats: ~$1-2/month

---

## 3. Get PostgreSQL Database (FREE option)

**What it does:** Stores user accounts, messages, uploaded documents

**Easiest FREE option - Supabase:**

1. Go to: https://supabase.com/
2. Click "Start your project"
3. Sign in with GitHub (or email)
4. Click "New project"
5. Fill out:
   - Name: `fitness-coach-ai`
   - Database Password: Make a strong password (SAVE IT!)
   - Region: Choose closest to you
6. Click "Create new project" (takes 2-3 minutes)
7. Once ready, click "Settings" → "Database"
8. Scroll to "Connection string" → "URI"
9. Click "Copy" next to the connection string
10. It looks like: `postgresql://postgres:[YOUR-PASSWORD]@db.xxx.supabase.co:5432/postgres`

**Cost:** FREE forever for small projects (up to 500MB)

---

## 4. Skip ChromaDB for Now (Optional)

**What it does:** Makes AI responses more accurate by finding relevant training docs

**For testing:** You can skip this! The app will work without it, just won't pull from uploaded documents initially.

**Add later:** Once you're ready, I'll help you set it up (takes 5 min with Railway)

---

## Summary - What You Need

By the end, you should have:

- ✅ Anthropic API Key (sk-ant-...)
- ✅ OpenAI API Key (sk-...)
- ✅ PostgreSQL Connection String (postgresql://...)
- ⏸️ ChromaDB (skip for now)

Keep all these saved in a text file - you'll need them for the next step!

---

**Next:** Once you have these, I'll show you how to add them to Vercel (takes 2 minutes)

# 🚀 START HERE - Complete Setup Guide

**Welcome!** This guide will get your Gerardi Performance AI Coach running on Vercel in about 30 minutes.

## What You're Building

An AI chatbot that:
- Talks like your friend (the fitness coach)
- Answers questions about training coaches and business
- Remembers all his philosophies and methods
- Available 24/7 for clients

## Prerequisites

- ✅ Code is already on GitHub (you have this!)
- ✅ Vercel account connected to GitHub (you have this!)
- ⏰ 30 minutes
- 💳 Credit card (for free trials - won't be charged during testing)

---

## Step-by-Step Setup

### Phase 1: Get Your API Keys (15 minutes)

**📖 Follow:** [SETUP-GUIDE.md](./SETUP-GUIDE.md)

This will walk you through:
1. Getting Anthropic API key (for Claude AI) - **5 min**
2. Getting OpenAI API key (for document search) - **5 min**
3. Setting up free PostgreSQL database (Supabase) - **5 min**

**By the end you'll have:**
- Anthropic API Key (sk-ant-...)
- OpenAI API Key (sk-...)
- Database connection string (postgresql://...)

💡 **Tip:** Keep all these in a text file - you'll need them next!

---

### Phase 2: Configure Vercel (10 minutes)

**📖 Follow:** [VERCEL-SETUP.md](./VERCEL-SETUP.md)

This will show you how to:
1. Add environment variables to Vercel - **5 min**
2. Redeploy your site - **2 min**
3. Initialize the database - **3 min**

**By the end:**
- Your app will be live on Vercel
- Login will work
- Ready to add training materials

---

### Phase 3: Test It Out (5 minutes)

1. **Visit your site:**
   - Go to your Vercel URL
   - You should see "GERARDI PERFORMANCE" landing page

2. **Login as admin:**
   - Click "Login"
   - Use the email/password you set in Vercel

3. **Upload a test document:**
   - Go to `/admin` (add to end of your URL)
   - Click "Add Document"
   - Add a sample training philosophy (see below)

4. **Test the chat:**
   - Go to `/chat`
   - Ask a question related to your document
   - AI should respond!

---

## Sample Training Document

Copy this to test the system:

**Title:** Client Acquisition Strategy

**Type:** Philosophy

**Content:**
```
My approach to getting coaching clients focuses on three pillars:

1. AUTHORITY BUILDING
   - Post daily on social media
   - Share client success stories
   - Offer free workshops

2. RELATIONSHIP FIRST
   - Never hard sell
   - Provide value upfront
   - Build trust over time

3. CONSISTENCY WINS
   - Show up every day
   - Follow up with leads within 24 hours
   - Track everything

The coaches who succeed are the ones who stick with it for 90 days minimum.
```

Then chat and ask: "How do I get more coaching clients?"

The AI should reference this document in its response!

---

## What If Something Goes Wrong?

### "Application error" on Vercel
- Double-check all environment variables in Vercel
- Make sure DATABASE_URL has no spaces
- Redeploy

### "Can't login"
- Database might not be initialized
- Go to Supabase → SQL Editor
- Run the SQL from [INIT-DATABASE.sql](./INIT-DATABASE.sql)

### "Still seeing Omelette site"
- Wait 5 minutes for Vercel to rebuild
- Hard refresh browser (Ctrl+Shift+R)

### "Database connection error"
- Check your Supabase database is running
- Verify DATABASE_URL is correct in Vercel
- Make sure you replaced `[YOUR-PASSWORD]` in the connection string

---

## Next Steps After Basic Setup

Once everything works:

1. **Add real training materials** (the more the better!)
2. **Create client accounts** in Supabase
3. **Customize branding** (change colors, coach name)
4. **Add ChromaDB** for better AI responses (I'll help)
5. **Add voice** with ElevenLabs (optional, cool feature)

---

## Cost Breakdown

**Free during testing:**
- Supabase: FREE tier (500MB)
- Anthropic: $5 free credit
- OpenAI: $5 free credit
- Vercel: FREE for hobby projects

**After free credits (~100-500 chats):**
- Vercel: Still FREE
- Supabase: Still FREE (under 500MB)
- Anthropic API: ~$5-20/month
- OpenAI API: ~$1-5/month

**Total: ~$6-25/month for moderate use**

---

## Need Help?

**I'm here to help!** Just tell me:
- Which step you're on
- What error you're seeing (if any)
- Screenshot helps!

I'll walk you through it.

---

## Quick Links

- 📖 [SETUP-GUIDE.md](./SETUP-GUIDE.md) - Get API keys
- ⚙️ [VERCEL-SETUP.md](./VERCEL-SETUP.md) - Configure Vercel
- 🗄️ [INIT-DATABASE.sql](./INIT-DATABASE.sql) - Database setup SQL
- 📚 [README.md](./README.md) - Full technical docs
- 🚀 [DEPLOYMENT.md](./DEPLOYMENT.md) - Advanced deployment
- ⚡ [QUICKSTART.md](./QUICKSTART.md) - Local development

---

**Ready?** Start with [SETUP-GUIDE.md](./SETUP-GUIDE.md) to get your API keys!

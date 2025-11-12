# Vercel Deployment Setup - Final Steps

## The Problem
Your app is deployed to Vercel but showing configuration errors because environment variables aren't set yet.

## The Solution (2 Minutes)

### Step 1: Get a Fresh Vercel Token
1. Go to: https://vercel.com/account/tokens
2. Click **"Create"**
3. Name it: `env-setup`
4. **IMPORTANT**: Select **"Full Account"** scope
5. Click **"Create Token"**
6. **Copy the token** (you'll only see it once!)

### Step 2: Run the Automated Script
Open Terminal and run these two commands:

```bash
cd /Users/chrislanzilli/nodejs  # or wherever your project is
bash setup-env.sh
```

When prompted, **paste your token** and press Enter.

The script will automatically:
- ✅ Validate your token
- ✅ Find your Vercel project ID
- ✅ Add all 9 environment variables from `.env.local`
- ✅ Trigger a fresh deployment

### Step 3: Wait & Test (2-3 minutes)
After the script finishes, wait 2-3 minutes for Vercel to redeploy.

Then visit: https://nodejs-git-claude-fitness-coach-10be17-chris-lanzillis-projects.vercel.app

You should see the **Gerardi Performance** landing page!

### Step 4: Login as Admin
1. Click **"Sign In"**
2. Email: `chris@saveyatech.com`
3. Password: `Lanzilli@20`

You should now be able to:
- ✅ Access the AI chat
- ✅ Upload training materials in the Admin panel
- ✅ Have conversations with your AI fitness coach

---

## Troubleshooting

### "Access denied" error when running script
- Your token expired or doesn't have full access
- Create a **NEW** token with **"Full Account"** scope

### "Project not found" error
- The script will show you available projects
- Make sure you're using the right Vercel account

### App still shows error after deployment
- Wait the full 2-3 minutes for Vercel to build
- Check Vercel dashboard for build errors
- Run the script again to ensure all env vars were added

---

## What's Next?

Once logged in as admin, you can:

1. **Upload Training Materials**
   - Go to Admin Panel
   - Add philosophies, meeting notes, training content
   - These will be used by the AI to answer questions

2. **Test the AI Chat**
   - Start a conversation
   - The AI will respond as Gerardi Performance
   - Currently using Claude Sonnet 4.5 model

3. **Future Enhancements**
   - Voice capabilities (ElevenLabs integration)
   - Re-enable ChromaDB for better document search
   - Add more client features

---

## Environment Variables Being Added

The script adds these variables from `.env.local`:

- `DATABASE_URL` - Supabase PostgreSQL connection
- `NEXTAUTH_URL` - Your Vercel deployment URL
- `NEXTAUTH_SECRET` - Authentication secret
- `ANTHROPIC_API_KEY` - Claude API key
- `OPENAI_API_KEY` - OpenAI API key (for embeddings)
- `ADMIN_EMAIL` - Admin login email
- `ADMIN_PASSWORD` - Admin login password
- `COACH_NAME` - Coach name for AI responses
- `COACH_BIO` - Coach biography for AI context

---

**Need help?** The script has detailed error messages that will guide you if something goes wrong.

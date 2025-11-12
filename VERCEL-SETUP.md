# Setting Up Environment Variables in Vercel

Once you have your API keys from SETUP-GUIDE.md, follow these steps:

## Step 1: Go to Your Vercel Project

1. Go to: https://vercel.com/dashboard
2. Find your project: `nodejs-git-claude-fitness-coach...`
3. Click on it

## Step 2: Add Environment Variables

1. Click "Settings" tab (top of page)
2. Click "Environment Variables" in left sidebar
3. You'll see a form with "Key" and "Value"

Add these one by one:

### Variable 1: DATABASE_URL
- **Key:** `DATABASE_URL`
- **Value:** Paste your Supabase connection string
  - Example: `postgresql://postgres:yourpassword@db.xxx.supabase.co:5432/postgres`
- Click "Add"

### Variable 2: NEXTAUTH_URL
- **Key:** `NEXTAUTH_URL`
- **Value:** Your Vercel URL
  - Example: `https://nodejs-git-claude-fitness-coach-10be17-chris-lanzillis-projects.vercel.app`
- Click "Add"

### Variable 3: NEXTAUTH_SECRET
- **Key:** `NEXTAUTH_SECRET`
- **Value:** Generate one here: https://generate-secret.vercel.app/32
  - Just copy the random string it gives you
- Click "Add"

### Variable 4: ANTHROPIC_API_KEY
- **Key:** `ANTHROPIC_API_KEY`
- **Value:** Paste your Anthropic key (starts with `sk-ant-`)
- Click "Add"

### Variable 5: OPENAI_API_KEY
- **Key:** `OPENAI_API_KEY`
- **Value:** Paste your OpenAI key (starts with `sk-`)
- Click "Add"

### Variable 6: ADMIN_EMAIL
- **Key:** `ADMIN_EMAIL`
- **Value:** Your email for admin login
  - Example: `chris@example.com`
- Click "Add"

### Variable 7: ADMIN_PASSWORD
- **Key:** `ADMIN_PASSWORD`
- **Value:** Create a strong password for admin login
  - Example: `MySecurePass123!`
- Click "Add"

### Variable 8: COACH_NAME
- **Key:** `COACH_NAME`
- **Value:** `Gerardi Performance`
- Click "Add"

### Variable 9: COACH_BIO
- **Key:** `COACH_BIO`
- **Value:** `Fitness coach specializing in training other fitness coaches`
- Click "Add"

### Variable 10: CHROMA_URL (Optional - skip for now)
- **Key:** `CHROMA_URL`
- **Value:** `http://localhost:8000` (we'll change this later)
- Click "Add"

## Step 3: Redeploy

1. Go to "Deployments" tab (top of page)
2. Find the latest deployment
3. Click the three dots (...) on the right
4. Click "Redeploy"
5. Check "Use existing Build Cache"
6. Click "Redeploy"

Wait 2-3 minutes for deployment to finish.

## Step 4: Initialize Database

This creates the database tables and admin account.

**Option A - Use Vercel Dashboard (Easiest):**

Unfortunately Vercel doesn't have a built-in terminal for this. Skip to Option B.

**Option B - Use Your Computer:**

1. Open Terminal (Mac) or Command Prompt (Windows)
2. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```
3. Login to Vercel:
   ```bash
   vercel login
   ```
4. Link to your project:
   ```bash
   cd /path/to/your/project
   vercel link
   ```
5. Pull environment variables:
   ```bash
   vercel env pull .env.local
   ```
6. Initialize database:
   ```bash
   npm run db:push
   npm run create-admin
   ```

**Option C - Easiest: Use Supabase SQL Editor**

1. Go to your Supabase project
2. Click "SQL Editor" in left sidebar
3. Copy this SQL (I'll generate it for you next)
4. Paste and run it

Let me know when you're ready and I'll create the SQL for you!

## Step 5: Test Your App

1. Go to your Vercel URL
2. You should see the **Gerardi Performance** landing page (not Omelette!)
3. Click "Login"
4. Use the email and password you set in environment variables
5. You should be able to access the app!

---

## Troubleshooting

**"Application error" on Vercel:**
- Check all environment variables are set correctly
- Make sure DATABASE_URL has no spaces
- Redeploy after adding variables

**Can't login:**
- Database might not be initialized
- Try the SQL option (I'll help you)

**Still seeing Omelette site:**
- Wait 5 minutes for deployment to finish
- Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)

---

**Stuck? Let me know which step and I'll walk you through it!**

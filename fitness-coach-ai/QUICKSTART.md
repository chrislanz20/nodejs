# Quick Start Guide

Get your Gerardi Performance AI Coach running in 5 minutes!

## Prerequisites

- Node.js 18+ installed
- PostgreSQL database (local or hosted)
- Anthropic API key ([Get one here](https://console.anthropic.com/))
- OpenAI API key ([Get one here](https://platform.openai.com/api-keys))

## 5-Minute Setup

### 1. Install Dependencies

\`\`\`bash
npm install
\`\`\`

### 2. Start ChromaDB (Vector Database)

**Option A - Docker (Recommended):**
\`\`\`bash
docker run -d -p 8000:8000 chromadb/chroma
\`\`\`

**Option B - Skip for now:**
You can skip ChromaDB initially. The app will work but won't provide context-aware responses until you set it up.

### 3. Configure Environment

Create `.env.local`:

\`\`\`bash
cp .env.local.example .env.local
\`\`\`

**Minimal configuration** (replace with your values):

\`\`\`env
DATABASE_URL="postgresql://user:password@localhost:5432/fitness_coach_ai"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="run: openssl rand -base64 32"
ANTHROPIC_API_KEY="sk-ant-..."
OPENAI_API_KEY="sk-..."
CHROMA_URL="http://localhost:8000"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="yourpassword"
\`\`\`

### 4. Initialize Database

\`\`\`bash
npm run db:push
npm run create-admin
\`\`\`

### 5. Start the App

\`\`\`bash
npm run dev
\`\`\`

Visit: **http://localhost:3000**

---

## First Steps

### 1. Login as Admin

- Go to http://localhost:3000/login
- Use the email and password from your `.env.local`

### 2. Add Training Materials

- Navigate to http://localhost:3000/admin
- Click "Add Document"
- Upload your coaching philosophies, meeting notes, training materials
- Each document gets indexed in the vector database

### 3. Test the Chat

- Go to http://localhost:3000/chat
- Ask questions like:
  - "How do I acquire new coaching clients?"
  - "What's your approach to training other coaches?"
  - "How should I price my coaching services?"

---

## Sample Training Document

To test the system, add this sample document in the admin panel:

**Title:** Client Acquisition Philosophy

**Type:** Philosophy

**Content:**
\`\`\`
My approach to client acquisition for fitness coaches focuses on three pillars:

1. AUTHORITY BUILDING
   - Establish yourself as an expert through consistent content
   - Share transformation stories (with permission)
   - Speak at local gyms and fitness events
   - Get certified in specialized areas

2. RELATIONSHIP MARKETING
   - Focus on serving, not selling
   - Offer free value (7-day challenges, workshops)
   - Build genuine connections on social media
   - Ask for referrals from satisfied clients

3. SYSTEMS & CONSISTENCY
   - Post 3-5 times per week minimum
   - Follow up with leads within 24 hours
   - Track your conversion rates
   - Test different offers and messaging

The key is to be patient but persistent. Most coaches quit before they see results. Give it 90 days of consistent effort.
\`\`\`

Now chat with your AI and ask: "What's the best way to get new clients?"

---

## Troubleshooting

### "Can't connect to database"
Check your PostgreSQL is running:
\`\`\`bash
psql $DATABASE_URL -c "SELECT 1"
\`\`\`

### "ChromaDB connection failed"
Make sure Docker container is running:
\`\`\`bash
docker ps | grep chroma
\`\`\`

Or skip ChromaDB temporarily by commenting out vector store calls in the code.

### "Invalid API key"
Verify your keys work:
\`\`\`bash
# Test Anthropic
curl https://api.anthropic.com/v1/messages \\
  -H "x-api-key: $ANTHROPIC_API_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "content-type: application/json" \\
  -d '{"model":"claude-sonnet-4-5-20250929","max_tokens":100,"messages":[{"role":"user","content":"Hi"}]}'
\`\`\`

---

## Next Steps

1. **Customize Branding**: Edit colors in `tailwind.config.ts`
2. **Add More Documents**: The more training materials you add, the better the AI
3. **Create User Accounts**: Add clients manually in Prisma Studio (`npm run db:studio`)
4. **Deploy**: See [DEPLOYMENT.md](./DEPLOYMENT.md) for production setup
5. **Add Voice**: Consider integrating ElevenLabs for voice chat (future enhancement)

---

## Need Help?

- 📖 Read the full [README.md](./README.md)
- 🚀 Check [DEPLOYMENT.md](./DEPLOYMENT.md) for production setup
- 🐛 Open an issue on GitHub

---

**You're all set!** Start training your AI coach with your methodologies and let it help scale your coaching business.

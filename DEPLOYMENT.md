# Deployment Guide

This guide covers deploying the Gerardi Performance AI Coach to production.

## Quick Deploy Options

### Option 1: Railway (Easiest - Recommended for MVP)

Railway provides a simple all-in-one solution.

**Steps:**

1. **Push to GitHub**
   \`\`\`bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-github-repo>
   git push -u origin main
   \`\`\`

2. **Create Railway Project**
   - Go to [railway.app](https://railway.app)
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository

3. **Add PostgreSQL Database**
   - In your Railway project, click "New"
   - Select "Database" → "PostgreSQL"
   - Railway will automatically set DATABASE_URL

4. **Set Environment Variables**

   Go to your service settings → Variables → Add:

   \`\`\`
   NEXTAUTH_URL=https://your-app.railway.app
   NEXTAUTH_SECRET=<generate-with-openssl>
   ANTHROPIC_API_KEY=<your-key>
   OPENAI_API_KEY=<your-key>
   CHROMA_URL=http://localhost:8000
   ADMIN_EMAIL=admin@example.com
   ADMIN_PASSWORD=<secure-password>
   COACH_NAME=Gerardi Performance
   \`\`\`

5. **Deploy ChromaDB on Railway**
   - Click "New" → "Docker Image"
   - Use image: `chromadb/chroma`
   - Expose port 8000
   - Update CHROMA_URL to use Railway internal URL

6. **Initialize Database**

   After first deploy, run migrations:
   \`\`\`bash
   railway run npx prisma db push
   railway run node scripts/create-admin.js
   \`\`\`

7. **Done!** Your app is live at `https://your-app.railway.app`

**Monthly Cost**: ~$20-50 for low traffic

---

### Option 2: Vercel + External Services

Vercel is great for Next.js but requires external database and ChromaDB.

**Steps:**

1. **Deploy to Vercel**
   \`\`\`bash
   npm i -g vercel
   vercel
   \`\`\`

2. **Set Up PostgreSQL**

   Options:
   - Vercel Postgres (easiest)
   - Supabase (generous free tier)
   - Neon (serverless Postgres)

   Get connection string and add to Vercel environment variables.

3. **Deploy ChromaDB**

   Options:
   - Use managed ChromaDB Cloud
   - Deploy to Fly.io or Railway
   - Use alternative vector DB (Pinecone, Weaviate)

4. **Configure Environment Variables in Vercel**

   Project Settings → Environment Variables:
   \`\`\`
   DATABASE_URL=<your-postgres-url>
   NEXTAUTH_URL=<your-vercel-url>
   NEXTAUTH_SECRET=<generate>
   ANTHROPIC_API_KEY=<your-key>
   OPENAI_API_KEY=<your-key>
   CHROMA_URL=<your-chroma-url>
   ADMIN_EMAIL=admin@example.com
   ADMIN_PASSWORD=<secure-password>
   \`\`\`

5. **Initialize Database**
   \`\`\`bash
   vercel env pull .env.local
   npx prisma db push
   node scripts/create-admin.js
   \`\`\`

**Monthly Cost**: ~$30-80 (Vercel hobby + external services)

---

### Option 3: DigitalOcean App Platform

Good balance of simplicity and control.

**Steps:**

1. **Create App**
   - Go to DigitalOcean dashboard
   - Create → Apps → GitHub
   - Select repository

2. **Add Managed PostgreSQL**
   - Add Component → Database → PostgreSQL
   - DigitalOcean will inject DATABASE_URL

3. **Deploy ChromaDB**
   - Create separate app from `chromadb/chroma` Docker image
   - Or use DO Droplet with Docker

4. **Configure Environment Variables**

   In App settings:
   \`\`\`
   NEXTAUTH_URL=${APP_URL}
   NEXTAUTH_SECRET=<generate>
   ANTHROPIC_API_KEY=<your-key>
   OPENAI_API_KEY=<your-key>
   CHROMA_URL=<chroma-service-url>
   ADMIN_EMAIL=admin@example.com
   ADMIN_PASSWORD=<secure-password>
   \`\`\`

5. **Run Migrations**
   Use DigitalOcean console or run locally:
   \`\`\`bash
   doctl apps exec <app-id> -- npx prisma db push
   doctl apps exec <app-id> -- node scripts/create-admin.js
   \`\`\`

**Monthly Cost**: ~$40-100 (includes $15 DB)

---

## Alternative Vector Database Options

If you prefer not to self-host ChromaDB:

### Pinecone (Managed Vector DB)

1. Sign up at [pinecone.io](https://www.pinecone.io/)
2. Create index with 1536 dimensions (for OpenAI embeddings)
3. Update `lib/ai/vector-store.ts` to use Pinecone SDK
4. Add `PINECONE_API_KEY` and `PINECONE_ENVIRONMENT` to env vars

**Cost**: Free tier available, then $70/month

### Weaviate Cloud

1. Sign up at [weaviate.io](https://weaviate.io/pricing)
2. Create cluster
3. Update vector store implementation
4. Add Weaviate credentials to env

**Cost**: Free tier (14-day sandboxes), then $25+/month

### Supabase (PostgreSQL + pgvector)

1. Use Supabase for both PostgreSQL and vector storage
2. Enable pgvector extension
3. Simplify stack by removing ChromaDB
4. Update vector store to use Supabase client

**Cost**: Free tier generous, then $25+/month

---

## Production Checklist

### Before Going Live

- [ ] Change all default passwords
- [ ] Use strong NEXTAUTH_SECRET
- [ ] Set up proper domain with SSL
- [ ] Configure CORS properly
- [ ] Add rate limiting (see below)
- [ ] Set up error monitoring (Sentry)
- [ ] Configure backup for database
- [ ] Test all features in staging
- [ ] Set up analytics (Vercel Analytics, Plausible)
- [ ] Create user documentation
- [ ] Set up email notifications (optional)

### Rate Limiting

Add to `middleware.ts`:

\`\`\`typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 s'),
});

export async function middleware(request: Request) {
  const ip = request.headers.get('x-forwarded-for') ?? 'anonymous';
  const { success } = await ratelimit.limit(ip);

  if (!success) {
    return new Response('Rate limit exceeded', { status: 429 });
  }

  return NextResponse.next();
}
\`\`\`

Install: `npm install @upstash/ratelimit @upstash/redis`

### Monitoring

**Sentry Setup:**

\`\`\`bash
npm install @sentry/nextjs
npx @sentry/wizard -i nextjs
\`\`\`

Add to `.env.local`:
\`\`\`
SENTRY_DSN=<your-sentry-dsn>
\`\`\`

---

## Scaling Considerations

### For 100+ Concurrent Users

1. **Database Connection Pooling**
   - Use Prisma Data Proxy or PgBouncer
   - Increase connection limits

2. **Cache Frequently Used Documents**
   - Add Redis for vector search results
   - Cache Claude responses for common questions

3. **CDN for Static Assets**
   - Use Cloudflare or Vercel Edge Network
   - Optimize images and fonts

4. **Horizontal Scaling**
   - Most platforms auto-scale Next.js
   - Consider serverless functions for API routes

### For 1000+ Users

1. **Dedicated Services**
   - Separate API server from Next.js app
   - Dedicated Redis instance
   - Managed ChromaDB or Pinecone

2. **Background Job Processing**
   - Queue long-running tasks (document indexing)
   - Use BullMQ or Inngest

3. **Database Optimization**
   - Add read replicas
   - Implement connection pooling
   - Use database indexes strategically

---

## Cost Estimates

### MVP (10-50 users)
- Hosting: $20-50/month
- Database: $10-25/month
- Vector DB: Free or $20/month
- AI APIs: $50-100/month
- **Total**: ~$80-195/month

### Growth (100-500 users)
- Hosting: $50-100/month
- Database: $25-50/month
- Vector DB: $25-70/month
- AI APIs: $200-500/month
- **Total**: ~$300-720/month

### Scale (1000+ users)
- Hosting: $100-300/month
- Database: $50-150/month
- Vector DB: $70-200/month
- AI APIs: $1000-3000/month
- **Total**: ~$1220-3650/month

---

## Backup Strategy

### Automated Backups

**Railway/DigitalOcean**: Enable automatic database backups in dashboard

**Manual Backups**:
\`\`\`bash
# Backup database
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# Backup ChromaDB (if self-hosted)
docker exec <chroma-container> tar czf - /chroma/data > chroma-backup-$(date +%Y%m%d).tar.gz
\`\`\`

**Schedule with cron** (if self-hosting):
\`\`\`bash
0 2 * * * /path/to/backup-script.sh
\`\`\`

---

## Support

For deployment issues:
1. Check application logs in your hosting dashboard
2. Verify all environment variables are set
3. Test database connectivity
4. Ensure API keys are valid
5. Check ChromaDB connection

---

**Next Steps**: Once deployed, proceed to adding training materials in the admin panel!

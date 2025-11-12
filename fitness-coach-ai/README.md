# Gerardi Performance - AI Coach

A full-stack AI-powered fitness coach platform designed to help fitness coaches scale their business by providing 24/7 access to proven training methodologies and business strategies.

## Features

- 🤖 **AI-Powered Chat** - Claude-based conversational AI trained on custom coaching methodologies
- 📚 **RAG (Retrieval Augmented Generation)** - Vector database for accurate, context-aware responses
- 🎨 **Custom Branding** - Gerardi Performance design system with bold, performance-driven aesthetics
- 🔐 **Authentication** - Secure user authentication with NextAuth
- 👤 **User Management** - Role-based access (Admin, Coach, Client)
- 📝 **Knowledge Base** - Admin panel for managing training materials and philosophies
- 💬 **Conversation History** - Persistent chat conversations per user
- 🎯 **Source Attribution** - Shows which documents were used to generate responses

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, TailwindCSS
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: PostgreSQL
- **AI**: Claude API (Anthropic), OpenAI Embeddings
- **Vector DB**: ChromaDB
- **Auth**: NextAuth.js
- **Styling**: TailwindCSS with custom Gerardi Performance color palette

## Design System

### Colors
- Background Black: `#000000`
- Headline White: `#FFFFFF`
- Accent Red (Logo/Text): `#D64541`
- Highlight Red (Subtext): `#E8473F`
- Muted Gray Text: `#D0D0D0`
- Light Gray Hover: `#F5F5F5`

### Typography
- **Display Font**: Bebas Neue (headlines, logos)
- **Body Font**: Montserrat (content, UI)

## Prerequisites

Before you begin, ensure you have:

- Node.js 18+ installed
- PostgreSQL database
- Anthropic API key (Claude)
- OpenAI API key (for embeddings)
- ChromaDB instance (can run locally with Docker)

## Setup Instructions

### 1. Clone and Install Dependencies

\`\`\`bash
git clone <your-repo-url>
cd fitness-coach-ai
npm install
\`\`\`

### 2. Set Up ChromaDB

Run ChromaDB locally with Docker:

\`\`\`bash
docker run -p 8000:8000 chromadb/chroma
\`\`\`

Or use ChromaDB cloud service (see https://www.trychroma.com/)

### 3. Configure Environment Variables

Copy the example environment file:

\`\`\`bash
cp .env.local.example .env.local
\`\`\`

Edit `.env.local` and fill in your credentials:

\`\`\`env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/fitness_coach_ai"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="<generate-with-openssl-rand-base64-32>"

# Claude API
ANTHROPIC_API_KEY="your-anthropic-api-key"

# OpenAI (for embeddings)
OPENAI_API_KEY="your-openai-api-key"

# ChromaDB
CHROMA_URL="http://localhost:8000"

# Admin credentials
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="secure-password"

# Coach Info
COACH_NAME="Gerardi Performance"
COACH_BIO="Fitness coach specializing in training other fitness coaches"
\`\`\`

**Generate NEXTAUTH_SECRET:**
\`\`\`bash
openssl rand -base64 32
\`\`\`

### 4. Set Up Database

Initialize Prisma and create the database schema:

\`\`\`bash
npx prisma generate
npx prisma db push
\`\`\`

### 5. Create Admin User

Run the seed script to create an admin user:

\`\`\`bash
node scripts/create-admin.js
\`\`\`

### 6. Start Development Server

\`\`\`bash
npm run dev
\`\`\`

The application will be available at `http://localhost:3000`

## Usage

### Admin Panel

1. Login with your admin credentials at `/login`
2. Navigate to `/admin` to access the knowledge management panel
3. Upload training materials, philosophies, meeting notes, and resources
4. Documents are automatically indexed in the vector database

### Chat Interface

1. Users login at `/login`
2. Access the chat interface at `/chat`
3. Ask questions about fitness coaching, business development, client acquisition
4. The AI responds based on uploaded knowledge documents
5. View source documents used for each response

## Project Structure

\`\`\`
fitness-coach-ai/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/  # NextAuth configuration
│   │   ├── chat/                # Chat API endpoint
│   │   └── knowledge/           # Knowledge management API
│   ├── admin/                   # Admin panel
│   ├── chat/                    # Chat interface
│   ├── components/              # React components
│   ├── login/                   # Login page
│   ├── globals.css              # Global styles
│   ├── layout.tsx               # Root layout
│   └── page.tsx                 # Landing page
├── lib/
│   ├── ai/
│   │   ├── claude.ts           # Claude API integration
│   │   ├── embeddings.ts       # OpenAI embeddings
│   │   └── vector-store.ts     # ChromaDB integration
│   ├── auth/
│   │   └── config.ts           # NextAuth configuration
│   └── db/
│       └── prisma.ts           # Prisma client
├── prisma/
│   └── schema.prisma           # Database schema
├── public/                     # Static assets
└── package.json
\`\`\`

## Deployment

### Railway (Recommended)

1. Push your code to GitHub
2. Connect your repo to Railway
3. Add PostgreSQL database addon
4. Set environment variables in Railway dashboard
5. Deploy!

### Vercel

1. Push your code to GitHub
2. Import project in Vercel
3. Set up PostgreSQL database (Vercel Postgres or external)
4. Configure environment variables
5. Deploy!

**Note**: You'll need to deploy ChromaDB separately or use a managed ChromaDB service.

## API Costs

### Estimated Monthly Costs (100 active users, 10 chats/user/month):

- **Claude API**: ~$50-150/month (Sonnet 4.5)
- **OpenAI Embeddings**: ~$10-20/month
- **Database**: $10-25/month (managed PostgreSQL)
- **ChromaDB**: Free (self-hosted) or $20-50/month (managed)
- **Hosting**: $5-20/month (Railway/Vercel)

**Total**: ~$100-250/month for moderate usage

## Customization

### Change Coach Name/Branding

Edit environment variables:
\`\`\`env
COACH_NAME="Your Coach Name"
COACH_BIO="Your coaching specialty"
\`\`\`

### Modify Design Colors

Edit `tailwind.config.ts`:
\`\`\`typescript
colors: {
  brand: {
    black: '#000000',
    white: '#FFFFFF',
    red: '#YOUR_COLOR',
    // ... more colors
  },
},
\`\`\`

### Add Voice Capabilities (Future Enhancement)

Consider integrating:
- **ElevenLabs** for voice cloning and text-to-speech
- **Whisper API** for speech-to-text
- **WebRTC** for real-time voice chat

## Security Considerations

- ✅ Environment variables for sensitive data
- ✅ Password hashing with bcryptjs
- ✅ JWT-based session management
- ✅ Role-based access control
- ✅ Input validation and sanitization
- ⚠️ Add rate limiting for production
- ⚠️ Implement CSRF protection
- ⚠️ Set up proper CORS policies

## Troubleshooting

### ChromaDB Connection Issues

Make sure ChromaDB is running:
\`\`\`bash
docker ps | grep chroma
\`\`\`

### Database Connection Errors

Verify your DATABASE_URL is correct and PostgreSQL is running:
\`\`\`bash
npx prisma db pull
\`\`\`

### Claude API Errors

Check your API key and ensure you have credits:
\`\`\`bash
curl https://api.anthropic.com/v1/messages \\
  -H "x-api-key: $ANTHROPIC_API_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "content-type: application/json" \\
  -d '{"model":"claude-sonnet-4-5-20250929","max_tokens":1024,"messages":[{"role":"user","content":"Hello"}]}'
\`\`\`

## Contributing

This is a custom project for Gerardi Performance. For feature requests or bugs, please open an issue.

## License

Proprietary - All rights reserved

---

Built with ❤️ using Claude Code

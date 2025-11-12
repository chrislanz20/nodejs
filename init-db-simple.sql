-- Gerardi Performance AI Coach - Database Setup
-- Copy and paste this entire script into Supabase SQL Editor

-- Create Users table
CREATE TABLE IF NOT EXISTS "User" (
    id TEXT PRIMARY KEY DEFAULT 'c' || substr(md5(random()::text), 1, 24),
    name TEXT,
    email TEXT UNIQUE NOT NULL,
    "emailVerified" TIMESTAMP,
    password TEXT,
    image TEXT,
    role TEXT DEFAULT 'client',
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create Accounts table
CREATE TABLE IF NOT EXISTS "Account" (
    id TEXT PRIMARY KEY DEFAULT 'c' || substr(md5(random()::text), 1, 24),
    "userId" TEXT NOT NULL,
    type TEXT NOT NULL,
    provider TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    refresh_token TEXT,
    access_token TEXT,
    expires_at INTEGER,
    token_type TEXT,
    scope TEXT,
    id_token TEXT,
    session_state TEXT,
    UNIQUE(provider, "providerAccountId"),
    FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE
);

-- Create Sessions table
CREATE TABLE IF NOT EXISTS "Session" (
    id TEXT PRIMARY KEY DEFAULT 'c' || substr(md5(random()::text), 1, 24),
    "sessionToken" TEXT UNIQUE NOT NULL,
    "userId" TEXT NOT NULL,
    expires TIMESTAMP NOT NULL,
    FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE
);

-- Create VerificationToken table
CREATE TABLE IF NOT EXISTS "VerificationToken" (
    identifier TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires TIMESTAMP NOT NULL,
    UNIQUE(identifier, token)
);

-- Create Conversations table
CREATE TABLE IF NOT EXISTS "Conversation" (
    id TEXT PRIMARY KEY DEFAULT 'c' || substr(md5(random()::text), 1, 24),
    "userId" TEXT NOT NULL,
    title TEXT,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE
);

-- Create Messages table
CREATE TABLE IF NOT EXISTS "Message" (
    id TEXT PRIMARY KEY DEFAULT 'c' || substr(md5(random()::text), 1, 24),
    "conversationId" TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"(id) ON DELETE CASCADE
);

-- Create KnowledgeDocument table
CREATE TABLE IF NOT EXISTS "KnowledgeDocument" (
    id TEXT PRIMARY KEY DEFAULT 'c' || substr(md5(random()::text), 1, 24),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT NOT NULL,
    metadata JSONB,
    "vectorId" TEXT,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "Account_userId_idx" ON "Account"("userId");
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");
CREATE INDEX IF NOT EXISTS "Conversation_userId_idx" ON "Conversation"("userId");
CREATE INDEX IF NOT EXISTS "Message_conversationId_idx" ON "Message"("conversationId");
CREATE INDEX IF NOT EXISTS "KnowledgeDocument_type_idx" ON "KnowledgeDocument"(type);

-- Create admin user (chris@saveyatech.com / Lanzilli@20)
-- Password is hashed with bcrypt
INSERT INTO "User" (id, email, password, name, role, "createdAt", "updatedAt")
VALUES (
    'c' || substr(md5(random()::text), 1, 24),
    'chris@saveyatech.com',
    '$2b$10$1yeuXE.BJx8ZqWD8QLsnLeNFjxqSj2J.hGfy2p8nlgkguHUqDWB.S',
    'Chris Lanzilli',
    'admin',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT (email) DO NOTHING;

-- Success message
SELECT 'Database initialized successfully! You can now login with: chris@saveyatech.com' as message;

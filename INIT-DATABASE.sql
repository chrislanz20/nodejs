-- Gerardi Performance AI Coach - Database Initialization
-- Run this in Supabase SQL Editor if you can't use command line

-- Create Users table
CREATE TABLE IF NOT EXISTS "User" (
    id TEXT PRIMARY KEY,
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
    id TEXT PRIMARY KEY,
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
    id TEXT PRIMARY KEY,
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
    id TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    title TEXT,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE
);

-- Create Messages table
CREATE TABLE IF NOT EXISTS "Message" (
    id TEXT PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"(id) ON DELETE CASCADE
);

-- Create KnowledgeDocument table
CREATE TABLE IF NOT EXISTS "KnowledgeDocument" (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT NOT NULL,
    metadata JSONB,
    "vectorId" TEXT,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS "Account_userId_idx" ON "Account"("userId");
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");
CREATE INDEX IF NOT EXISTS "Conversation_userId_idx" ON "Conversation"("userId");
CREATE INDEX IF NOT EXISTS "Message_conversationId_idx" ON "Message"("conversationId");
CREATE INDEX IF NOT EXISTS "KnowledgeDocument_type_idx" ON "KnowledgeDocument"(type);

-- Function to generate CUID-like IDs (simple version)
CREATE OR REPLACE FUNCTION generate_cuid() RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'abcdefghijklmnopqrstuvwxyz0123456789';
    result TEXT := 'c';
    i INTEGER;
BEGIN
    FOR i IN 1..24 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Create admin user
-- IMPORTANT: Change the email and password below before running!
DO $$
DECLARE
    admin_id TEXT;
    admin_email TEXT := 'admin@example.com'; -- CHANGE THIS
    -- Password: admin123 (hashed with bcrypt)
    -- CHANGE THIS PASSWORD by generating new hash at: https://bcrypt-generator.com/
    admin_password TEXT := '$2a$10$K3PGKxBRXWBkJHHJfJoG8OqFqFxgXqWqXJCxQWX3.KJQXGYQwBQQa';
BEGIN
    -- Check if admin already exists
    IF NOT EXISTS (SELECT 1 FROM "User" WHERE email = admin_email) THEN
        admin_id := generate_cuid();

        INSERT INTO "User" (id, email, password, name, role, "createdAt", "updatedAt")
        VALUES (
            admin_id,
            admin_email,
            admin_password,
            'Admin',
            'admin',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        );

        RAISE NOTICE 'Admin user created successfully!';
        RAISE NOTICE 'Email: %', admin_email;
        RAISE NOTICE 'Password: admin123 (CHANGE THIS IMMEDIATELY!)';
    ELSE
        RAISE NOTICE 'Admin user already exists!';
    END IF;
END $$;

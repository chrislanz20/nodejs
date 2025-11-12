-- Create Admin User for Gerardi Performance
-- Run this in your Supabase SQL Editor

-- Create the User table first (if it doesn't exist)
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

-- Insert admin user
-- Email: chris@saveyatech.com
-- Password: Lanzilli@20 (bcrypt hashed)
INSERT INTO "User" (id, email, password, name, role, "createdAt", "updatedAt")
VALUES (
    'cadmin_' || substr(md5(random()::text), 1, 20),
    'chris@saveyatech.com',
    '$2b$10$1yeuXE.BJx8ZqWD8QLsnLeNFjxqSj2J.hGfy2p8nlgkguHUqDWB.S',
    'Chris Lanzilli',
    'admin',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT (email) DO UPDATE SET
    password = EXCLUDED.password,
    role = 'admin',
    "updatedAt" = CURRENT_TIMESTAMP;

-- Verify the admin user was created
SELECT id, email, name, role, "createdAt"
FROM "User"
WHERE email = 'chris@saveyatech.com';

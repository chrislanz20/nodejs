-- Migration: Add last_login column to clients table
-- Created: 2025-01-17

-- Add last_login column to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_clients_last_login ON clients(last_login DESC);

-- Comment
COMMENT ON COLUMN clients.last_login IS 'Timestamp of the client''s last successful login';

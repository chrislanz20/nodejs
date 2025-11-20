-- Create leads table for tracking new client leads and conversions
CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,

  -- Call identification
  call_id TEXT,
  agent_id TEXT NOT NULL,
  phone_number TEXT NOT NULL,

  -- Lead information
  name TEXT,
  email TEXT,
  incident_description TEXT,
  category TEXT NOT NULL,  -- New Lead, Existing Client, etc.

  -- Status tracking
  status TEXT DEFAULT 'Pending',  -- Pending, In Progress, Approved, Denied
  conversion_detected BOOLEAN DEFAULT FALSE,
  conversion_call_id TEXT,  -- Call ID that triggered conversion detection

  -- Timestamps
  first_call_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_call_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status_updated_at TIMESTAMP,
  status_updated_by TEXT,  -- User who changed the status

  -- Notes
  notes TEXT,

  -- Indexes for fast lookups
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for phone number lookups (critical for conversion detection)
CREATE INDEX IF NOT EXISTS idx_leads_phone_number ON leads(phone_number);

-- Index for agent_id lookups (filter by client)
CREATE INDEX IF NOT EXISTS idx_leads_agent_id ON leads(agent_id);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);

-- Index for conversion detection
CREATE INDEX IF NOT EXISTS idx_leads_conversion ON leads(conversion_detected);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_leads_agent_phone ON leads(agent_id, phone_number);

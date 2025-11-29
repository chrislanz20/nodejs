-- ============================================
-- CALLER CRM SYSTEM
-- Version-controlled caller data with full audit trail
-- Created: 2025-11-28
-- ============================================

-- ============================================
-- CALLERS (main identity table - one per phone PER AGENT)
-- CRITICAL: Scoped by agent_id for security/privacy isolation
-- Each business has their own isolated caller profiles
-- ============================================
CREATE TABLE IF NOT EXISTS callers (
  id SERIAL PRIMARY KEY,
  phone_number VARCHAR(20) NOT NULL,
  agent_id VARCHAR(255) NOT NULL,              -- REQUIRED: Scopes caller to specific business
  caller_type VARCHAR(50) DEFAULT 'unknown',   -- 'injured_party', 'attorney', 'medical', 'insurance', 'other', 'unknown'
  organization VARCHAR(255),                   -- For professionals: law firm, hospital name, etc.
  preferred_language VARCHAR(20) DEFAULT 'english',
  total_calls INTEGER DEFAULT 1,
  first_call_date TIMESTAMP DEFAULT NOW(),
  last_call_date TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Unique constraint: one caller per phone number PER AGENT
-- Same phone can exist as different callers for different businesses
CREATE UNIQUE INDEX IF NOT EXISTS idx_callers_phone_agent_unique ON callers(phone_number, agent_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_callers_phone_agent ON callers(phone_number, agent_id);
CREATE INDEX IF NOT EXISTS idx_callers_agent ON callers(agent_id);
CREATE INDEX IF NOT EXISTS idx_callers_type ON callers(caller_type);

-- ============================================
-- CALLER DETAILS (versioned - never overwrite)
-- Every field change is a new record
-- ============================================
CREATE TABLE IF NOT EXISTS caller_details (
  id SERIAL PRIMARY KEY,
  caller_id INTEGER REFERENCES callers(id) ON DELETE CASCADE,

  -- The actual data
  field_name VARCHAR(50) NOT NULL,    -- 'name', 'email', 'callback_phone', 'address', etc.
  field_value TEXT,

  -- Audit trail
  source_call_id VARCHAR(255),        -- Which Retell call this came from
  source_type VARCHAR(50),            -- 'call_transcript', 'manual_entry', 'form_submission', 'ai_extraction'
  confidence VARCHAR(20),             -- 'verified', 'stated', 'inferred', 'corrected'

  -- Validity period (for time-travel queries)
  valid_from TIMESTAMP DEFAULT NOW(),
  valid_until TIMESTAMP,              -- NULL = current value, set when superseded

  -- Who/what made this change
  recorded_by VARCHAR(255) DEFAULT 'system',  -- 'system', 'ai_extraction', 'admin:chris@email.com'
  recorded_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_caller_details_current ON caller_details(caller_id, field_name) WHERE valid_until IS NULL;
CREATE INDEX IF NOT EXISTS idx_caller_details_history ON caller_details(caller_id, field_name, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_caller_details_call ON caller_details(source_call_id);

-- ============================================
-- CALLER CASES (links callers to cases/leads)
-- Tracks relationship between callers and cases
-- ============================================
CREATE TABLE IF NOT EXISTS caller_cases (
  id SERIAL PRIMARY KEY,
  caller_id INTEGER REFERENCES callers(id) ON DELETE CASCADE,
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,

  -- Relationship to this case
  relationship VARCHAR(50) NOT NULL,  -- 'injured_party', 'spouse', 'family', 'attorney', 'medical_provider', 'insurance_adjuster'

  -- Audit trail
  created_from_call_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,

  -- Prevent duplicate relationships
  UNIQUE(caller_id, lead_id, relationship)
);

CREATE INDEX IF NOT EXISTS idx_caller_cases_caller ON caller_cases(caller_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_caller_cases_lead ON caller_cases(lead_id) WHERE is_active = TRUE;

-- ============================================
-- CASE DETAILS (versioned - never overwrite)
-- Full history of case information changes
-- ============================================
CREATE TABLE IF NOT EXISTS case_details (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,

  -- The actual data
  field_name VARCHAR(50) NOT NULL,    -- 'incident_date', 'incident_location', 'injuries', 'case_status', etc.
  field_value TEXT,

  -- Audit trail
  source_call_id VARCHAR(255),
  source_type VARCHAR(50),            -- 'call_transcript', 'manual_entry', 'ai_extraction'

  -- Validity period
  valid_from TIMESTAMP DEFAULT NOW(),
  valid_until TIMESTAMP,              -- NULL = current value

  recorded_by VARCHAR(255) DEFAULT 'system',
  recorded_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_details_current ON case_details(lead_id, field_name) WHERE valid_until IS NULL;
CREATE INDEX IF NOT EXISTS idx_case_details_history ON case_details(lead_id, field_name, recorded_at DESC);

-- ============================================
-- CALL INTERACTIONS (every call logged)
-- Complete record of every call with context
-- ============================================
CREATE TABLE IF NOT EXISTS call_interactions (
  id SERIAL PRIMARY KEY,
  caller_id INTEGER REFERENCES callers(id) ON DELETE SET NULL,
  call_id VARCHAR(255) NOT NULL UNIQUE,  -- Retell call ID
  agent_id VARCHAR(255),                  -- Which AI agent handled this

  -- Call metadata
  phone_number VARCHAR(20),               -- Stored separately in case caller not identified
  call_direction VARCHAR(20),             -- 'inbound', 'outbound'
  call_start TIMESTAMP,
  call_end TIMESTAMP,
  duration_seconds INTEGER,

  -- Classification
  call_category VARCHAR(50),              -- 'new_lead', 'existing_client', 'attorney', etc.
  call_outcome VARCHAR(50),               -- 'info_collected', 'callback_scheduled', 'transferred', 'voicemail'

  -- What happened
  call_summary TEXT,
  transcript_snippet TEXT,                -- Key parts of conversation

  -- What was learned/updated
  data_collected JSONB,                   -- Snapshot of new info gathered
  fields_updated TEXT[],                  -- ['email', 'callback_phone'] - what changed

  -- Context for next call
  follow_up_needed BOOLEAN DEFAULT FALSE,
  follow_up_reason TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_interactions_caller ON call_interactions(caller_id);
CREATE INDEX IF NOT EXISTS idx_call_interactions_phone ON call_interactions(phone_number);
CREATE INDEX IF NOT EXISTS idx_call_interactions_date ON call_interactions(call_start DESC);
CREATE INDEX IF NOT EXISTS idx_call_interactions_agent ON call_interactions(agent_id);

-- ============================================
-- CALLER NOTES (manual notes about callers)
-- Staff can add notes that persist across calls
-- ============================================
CREATE TABLE IF NOT EXISTS caller_notes (
  id SERIAL PRIMARY KEY,
  caller_id INTEGER REFERENCES callers(id) ON DELETE CASCADE,

  note_type VARCHAR(50),                  -- 'general', 'preference', 'warning', 'follow_up'
  note TEXT NOT NULL,

  -- Context
  related_call_id VARCHAR(255),           -- If note is about a specific call
  related_lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,

  -- Audit
  created_by VARCHAR(255),                -- 'system', 'ai', 'admin:chris@email.com'
  created_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_caller_notes_caller ON caller_notes(caller_id) WHERE is_active = TRUE;

-- ============================================
-- VIEW: Current caller profile (latest values)
-- Makes it easy to get current state
-- ============================================
CREATE OR REPLACE VIEW caller_profile AS
SELECT
  c.id as caller_id,
  c.phone_number,
  c.caller_type,
  c.organization,
  c.preferred_language,
  c.total_calls,
  c.first_call_date,
  c.last_call_date,
  MAX(CASE WHEN cd.field_name = 'name' THEN cd.field_value END) as name,
  MAX(CASE WHEN cd.field_name = 'email' THEN cd.field_value END) as email,
  MAX(CASE WHEN cd.field_name = 'callback_phone' THEN cd.field_value END) as callback_phone,
  MAX(CASE WHEN cd.field_name = 'address' THEN cd.field_value END) as address
FROM callers c
LEFT JOIN caller_details cd ON c.id = cd.caller_id AND cd.valid_until IS NULL
WHERE c.is_active = TRUE
GROUP BY c.id, c.phone_number, c.caller_type, c.organization,
         c.preferred_language, c.total_calls, c.first_call_date, c.last_call_date;

-- ============================================
-- FUNCTION: Update caller field with history
-- ============================================
CREATE OR REPLACE FUNCTION update_caller_field(
  p_caller_id INTEGER,
  p_field_name VARCHAR(50),
  p_field_value TEXT,
  p_source_call_id VARCHAR(255),
  p_source_type VARCHAR(50) DEFAULT 'call_transcript',
  p_confidence VARCHAR(20) DEFAULT 'stated',
  p_recorded_by VARCHAR(255) DEFAULT 'system'
) RETURNS void AS $$
BEGIN
  -- Mark old value as superseded
  UPDATE caller_details
  SET valid_until = NOW()
  WHERE caller_id = p_caller_id
    AND field_name = p_field_name
    AND valid_until IS NULL;

  -- Insert new value
  INSERT INTO caller_details (
    caller_id, field_name, field_value,
    source_call_id, source_type, confidence, recorded_by
  ) VALUES (
    p_caller_id, p_field_name, p_field_value,
    p_source_call_id, p_source_type, p_confidence, p_recorded_by
  );

  -- Update caller's updated_at
  UPDATE callers SET updated_at = NOW() WHERE id = p_caller_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCTION: Get caller history for a field
-- ============================================
CREATE OR REPLACE FUNCTION get_caller_field_history(
  p_caller_id INTEGER,
  p_field_name VARCHAR(50)
) RETURNS TABLE (
  field_value TEXT,
  valid_from TIMESTAMP,
  valid_until TIMESTAMP,
  source_call_id VARCHAR(255),
  confidence VARCHAR(20),
  recorded_by VARCHAR(255)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cd.field_value,
    cd.valid_from,
    cd.valid_until,
    cd.source_call_id,
    cd.confidence,
    cd.recorded_by
  FROM caller_details cd
  WHERE cd.caller_id = p_caller_id
    AND cd.field_name = p_field_name
  ORDER BY cd.recorded_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Migration: Add incident_date and incident_location to leads table
-- Created: 2025-01-19

-- Add incident_date column
ALTER TABLE leads ADD COLUMN IF NOT EXISTS incident_date DATE;

-- Add incident_location column
ALTER TABLE leads ADD COLUMN IF NOT EXISTS incident_location TEXT;

-- Add index for incident_date (useful for filtering by date range)
CREATE INDEX IF NOT EXISTS idx_leads_incident_date ON leads(incident_date);

-- Comments
COMMENT ON COLUMN leads.incident_date IS 'Date when the incident occurred';
COMMENT ON COLUMN leads.incident_location IS 'Location where the incident occurred';

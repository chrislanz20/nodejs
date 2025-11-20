-- Migration: Add case_specific_data JSON column to store flexible case-type fields
-- Created: 2025-01-20
-- Purpose: Store all case-specific fields (rideshare, construction, workers_comp, etc.) flexibly

-- Add case_specific_data JSONB column
ALTER TABLE leads ADD COLUMN IF NOT EXISTS case_specific_data JSONB;

-- Add GIN index for efficient JSON queries
CREATE INDEX IF NOT EXISTS idx_leads_case_specific_data ON leads USING GIN (case_specific_data);

-- Add case_type column for easy filtering
ALTER TABLE leads ADD COLUMN IF NOT EXISTS case_type TEXT;

-- Create index on case_type for filtering
CREATE INDEX IF NOT EXISTS idx_leads_case_type ON leads(case_type);

-- Comments
COMMENT ON COLUMN leads.case_specific_data IS 'JSON object containing case-type specific fields extracted by AI (rideshare details, construction details, workers comp, etc.)';
COMMENT ON COLUMN leads.case_type IS 'Type of case: rideshare, car_accident, motorcycle, truck, bus, taxi, construction, slip_fall, workers_comp, medical_malpractice, other';

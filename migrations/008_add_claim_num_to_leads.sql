-- Migration: Add claim_num to leads table
-- Created: 2025-11-29
-- Purpose: Store claim numbers for existing client cases

-- Add claim_num column
ALTER TABLE leads ADD COLUMN IF NOT EXISTS claim_num TEXT;

-- Create index for claim number lookups
CREATE INDEX IF NOT EXISTS idx_leads_claim_num ON leads(claim_num);

-- Comments
COMMENT ON COLUMN leads.claim_num IS 'Insurance claim number or case reference number provided by caller';

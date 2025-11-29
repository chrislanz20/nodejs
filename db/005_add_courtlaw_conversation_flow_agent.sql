-- ============================================
-- ADD COURTLAW CONVERSATION FLOW AGENT ID
-- Migration to add the new Conversation Flow agent ID
-- to CourtLaw's agent_ids array
-- Created: 2025-11-28
-- ============================================

-- Add the new Conversation Flow agent ID to CourtLaw's agent_ids
-- This ensures both old (single prompt) and new (conversation flow) calls show up
UPDATE clients
SET agent_ids = array_append(agent_ids, 'agent_5aa697d50952f8834c76e6737e')
WHERE business_name ILIKE '%courtlaw%'
  AND NOT ('agent_5aa697d50952f8834c76e6737e' = ANY(agent_ids));

-- Verify the update
SELECT id, business_name, agent_ids
FROM clients
WHERE business_name ILIKE '%courtlaw%';

// Lead Tracking Module
// Handles new lead capture, conversion detection, and status management

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10
});

/**
 * Build case-specific data object from callData
 * @param {object} callData - Call data containing case details
 * @returns {object} Cleaned case-specific data (null values removed)
 */
function buildCaseSpecificData(callData) {
  const caseSpecificData = {
    // Rideshare
    rideshare_role: callData.rideshare_role || null,
    rideshare_service: callData.rideshare_service || null,
    rideshare_driver_info: callData.rideshare_driver_info || null,

    // Vehicle accidents
    vehicle_type: callData.vehicle_type || null,
    fault_determination: callData.fault_determination || null,
    police_report_filed: callData.police_report_filed || null,
    other_party_insured: callData.other_party_insured || null,
    injuries_sustained: callData.injuries_sustained || null,

    // Construction
    construction_site_type: callData.construction_site_type || null,
    injury_cause: callData.injury_cause || null,
    employer_name: callData.employer_name || null,
    safety_equipment: callData.safety_equipment || null,

    // Slip & Fall
    property_type: callData.property_type || null,
    fall_cause: callData.fall_cause || null,
    property_owner: callData.property_owner || null,
    witnesses_present: callData.witnesses_present || null,

    // Workers' Comp
    workplace_type: callData.workplace_type || null,
    work_injury_type: callData.work_injury_type || null,
    injury_reported: callData.injury_reported || null,
    doctor_visit: callData.doctor_visit || null
  };

  // Remove null values for cleaner JSON storage
  return Object.fromEntries(
    Object.entries(caseSpecificData).filter(([_, v]) => v !== null)
  );
}

/**
 * Create a new lead record
 * @param {object} params - Lead parameters
 * @returns {object} Created lead record
 */
async function createLead(callId, agentId, phoneNumber, category, callData) {
  const cleanedCaseData = buildCaseSpecificData(callData);

  const result = await pool.query(
    `INSERT INTO leads (
      call_id, agent_id, phone_number, name, email,
      incident_description, incident_date, incident_location,
      category, status, case_type, case_specific_data, referral_source, claim_num
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *`,
    [
      callId,
      agentId,
      phoneNumber,
      callData.name || (callData.first_name && callData.last_name ? callData.first_name + ' ' + callData.last_name : null),
      callData.email || callData.email_address || null,
      callData.incident_description || callData.summary || callData.purpose || null,
      callData.incident_date || null,
      callData.incident_location || null,
      category,
      'Pending',
      callData.case_type || null,
      Object.keys(cleanedCaseData).length > 0 ? JSON.stringify(cleanedCaseData) : null,
      callData.referral_source || null,
      callData.claim_num || callData.claim_number || null
    ]
  );

  return result.rows[0];
}

/**
 * Check if this appears to be a NEW incident vs same incident
 * Compares incident details to see if they match existing cases
 * @param {object} existingLeads - Array of existing lead records
 * @param {object} callData - Current call data
 * @returns {object} { isNewIncident: boolean, matchingLead: object|null }
 */
function detectNewIncident(existingLeads, callData) {
  if (!existingLeads || existingLeads.length === 0) {
    return { isNewIncident: true, matchingLead: null };
  }

  const newCaseType = (callData.case_type || '').toLowerCase();
  const newIncidentDate = callData.incident_date;
  const newIncidentLocation = (callData.incident_location || '').toLowerCase();

  for (const lead of existingLeads) {
    const existingCaseType = (lead.case_type || '').toLowerCase();
    const existingIncidentDate = lead.incident_date;
    const existingIncidentLocation = (lead.incident_location || '').toLowerCase();

    // If case type is different (car accident vs slip & fall), it's a new incident
    if (newCaseType && existingCaseType && newCaseType !== existingCaseType) {
      continue; // Check next lead
    }

    // If incident dates are significantly different (>30 days apart), likely new incident
    if (newIncidentDate && existingIncidentDate) {
      const newDate = new Date(newIncidentDate);
      const existingDate = new Date(existingIncidentDate);
      const daysDiff = Math.abs((newDate - existingDate) / (1000 * 60 * 60 * 24));
      if (daysDiff > 30) {
        continue; // Check next lead
      }
    }

    // If we get here, this appears to match an existing case
    return { isNewIncident: false, matchingLead: lead };
  }

  // No matching leads found - this is a new incident
  return { isNewIncident: true, matchingLead: null };
}

/**
 * Save or update a lead when a call is categorized
 * @param {string} callId - Retell call ID
 * @param {string} agentId - Retell agent ID
 * @param {string} category - Call category (New Lead, Existing Client, etc.)
 * @param {object} callData - Call data (phone, name, email, etc.)
 * @returns {object} Lead record and conversion detection result
 */
async function trackLead(callId, agentId, category, callData) {
  const phoneNumber = callData.phone || callData.phone_number || callData.from_number;

  if (!phoneNumber) {
    console.log('⚠️  No phone number found, skipping lead tracking');
    return null;
  }

  // Check for explicit confirmation flag (set by Maria when caller confirms existing case)
  const confirmedExistingCase = callData.confirmed_existing_case === 'true' ||
                                 callData.confirmed_existing_case === true;

  try {
    // Check if this phone number has any previous leads for this agent
    const previousLeads = await pool.query(
      `SELECT * FROM leads
       WHERE agent_id = $1 AND phone_number = $2
       ORDER BY first_call_date DESC`,
      [agentId, phoneNumber]
    );

    const existingLeads = previousLeads.rows;
    const mostRecentLead = existingLeads[0];
    let conversionDetected = false;
    let isNewLead = false;

    // SCENARIO 1: First time caller (no existing leads)
    if (!mostRecentLead) {
      if (category === 'New Lead') {
        const newLead = await createLead(callId, agentId, phoneNumber, category, callData);
        isNewLead = true;
        console.log(`✅ New lead saved: ${phoneNumber} (${callData.name || 'Unknown'})`);
        return { lead: newLead, isNewLead, conversionDetected };
      } else {
        // First call but not a "New Lead" - just track for history
        console.log(`ℹ️  First call from ${phoneNumber} is category: ${category} (not a New Lead)`);
        return null;
      }
    }

    // SCENARIO 2: Existing Client calling - could be about same case or NEW case
    if (category === 'Existing Client') {
      // FAST PATH: If caller explicitly confirmed existing case, skip detection
      if (confirmedExistingCase) {
        console.log(`   ✅ Caller confirmed existing case - skipping new incident detection`);
        const leadToUpdate = mostRecentLead;

        // Check for conversion
        if (leadToUpdate.category === 'New Lead') {
          conversionDetected = true;
          await pool.query(
            `UPDATE leads
             SET conversion_detected = true,
                 conversion_call_id = $1,
                 status = 'Approved',
                 status_updated_at = CURRENT_TIMESTAMP,
                 last_call_date = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP,
                 claim_num = COALESCE($3, claim_num)
             WHERE id = $2`,
            [callId, leadToUpdate.id, callData.claim_num || callData.claim_number || null]
          );

          console.log(`🎉 CONVERSION DETECTED! ${leadToUpdate.name || phoneNumber} → Auto-approved`);
          return {
            lead: { ...leadToUpdate, conversion_detected: true, status: 'Approved' },
            isNewLead: false,
            conversionDetected: true,
            confirmedExistingCase: true
          };
        }

        // Just update last call date
        await pool.query(
          `UPDATE leads
           SET last_call_date = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP,
               claim_num = COALESCE($2, claim_num)
           WHERE id = $1`,
          [leadToUpdate.id, callData.claim_num || callData.claim_number || null]
        );

        console.log(`ℹ️  ${phoneNumber} confirmed existing case (ID: ${leadToUpdate.id})`);
        return { lead: leadToUpdate, isNewLead: false, conversionDetected: false, confirmedExistingCase: true };
      }

      // Check if this is about the same incident or a new one
      const { isNewIncident, matchingLead } = detectNewIncident(existingLeads, callData);

      if (isNewIncident && callData.case_type) {
        // NEW INCIDENT for existing client - create a new lead record
        console.log(`🆕 Existing client calling about NEW incident (${callData.case_type})`);
        const newLead = await createLead(callId, agentId, phoneNumber, 'New Lead', callData);
        isNewLead = true;
        return { lead: newLead, isNewLead, conversionDetected: false, isNewIncidentForExistingClient: true };
      }

      // Same incident - update the matching lead (or most recent if no match)
      const leadToUpdate = matchingLead || mostRecentLead;

      // Check for conversion: was previously "New Lead", now "Existing Client"
      if (leadToUpdate.category === 'New Lead') {
        conversionDetected = true;
        await pool.query(
          `UPDATE leads
           SET conversion_detected = true,
               conversion_call_id = $1,
               status = 'Approved',
               status_updated_at = CURRENT_TIMESTAMP,
               last_call_date = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP,
               claim_num = COALESCE($3, claim_num)
           WHERE id = $2`,
          [callId, leadToUpdate.id, callData.claim_num || callData.claim_number || null]
        );

        console.log(`🎉 CONVERSION DETECTED! ${leadToUpdate.name || phoneNumber} called back as Existing Client → Auto-approved`);

        return {
          lead: { ...leadToUpdate, conversion_detected: true, conversion_call_id: callId, status: 'Approved' },
          isNewLead: false,
          conversionDetected: true
        };
      }

      // Already an existing client - just update last call date and claim_num if provided
      await pool.query(
        `UPDATE leads
         SET last_call_date = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP,
             claim_num = COALESCE($2, claim_num)
         WHERE id = $1`,
        [leadToUpdate.id, callData.claim_num || callData.claim_number || null]
      );

      console.log(`ℹ️  ${phoneNumber} called again as Existing Client (case ID: ${leadToUpdate.id})`);
      return { lead: leadToUpdate, isNewLead: false, conversionDetected: false };
    }

    // SCENARIO 3: New Lead calling again
    if (category === 'New Lead') {
      // Check if this is a genuinely new incident
      const { isNewIncident, matchingLead } = detectNewIncident(existingLeads, callData);

      if (isNewIncident && callData.case_type && callData.case_type !== mostRecentLead.case_type) {
        // Different case type - create new lead
        console.log(`🆕 Repeat caller with NEW case type: ${callData.case_type} (previous: ${mostRecentLead.case_type})`);
        const newLead = await createLead(callId, agentId, phoneNumber, category, callData);
        isNewLead = true;
        return { lead: newLead, isNewLead, conversionDetected: false };
      }

      // Same case type or no case type - update existing lead
      const leadToUpdate = matchingLead || mostRecentLead;
      await pool.query(
        `UPDATE leads
         SET last_call_date = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP,
             claim_num = COALESCE($2, claim_num)
         WHERE id = $1`,
        [leadToUpdate.id, callData.claim_num || callData.claim_number || null]
      );

      console.log(`ℹ️  ${phoneNumber} called again as New Lead (same case, ID: ${leadToUpdate.id})`);
      return { lead: leadToUpdate, isNewLead: false, conversionDetected: false };
    }

    // SCENARIO 4: Other category (Attorney, Medical, Insurance, Other)
    // These don't create leads, but we track the interaction
    console.log(`ℹ️  ${phoneNumber} called as ${category} (not lead-creating category)`);
    return { lead: mostRecentLead, isNewLead: false, conversionDetected: false };

  } catch (error) {
    console.error('❌ Lead tracking error:', error.message);
    throw error;
  }
}

/**
 * Update lead status manually (Approve, Deny, In Progress)
 * @param {number} leadId - Lead ID
 * @param {string} status - New status
 * @param {string} updatedBy - User who updated (optional)
 * @param {string} notes - Notes about the status change (optional)
 */
async function updateLeadStatus(leadId, status, updatedBy = null, notes = null) {
  try {
    const updateFields = ['status = $1', 'status_updated_at = CURRENT_TIMESTAMP', 'updated_at = CURRENT_TIMESTAMP'];
    const params = [status];
    let paramCount = 1;

    if (updatedBy) {
      paramCount++;
      updateFields.push(`status_updated_by = $${paramCount}`);
      params.push(updatedBy);
    }

    if (notes) {
      paramCount++;
      updateFields.push(`notes = $${paramCount}`);
      params.push(notes);
    }

    params.push(leadId);

    const result = await pool.query(
      `UPDATE leads
       SET ${updateFields.join(', ')}
       WHERE id = $${paramCount + 1}
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      throw new Error(`Lead ${leadId} not found`);
    }

    console.log(`✅ Lead ${leadId} status updated to: ${status}`);
    return result.rows[0];
  } catch (error) {
    console.error('❌ Update lead status error:', error.message);
    throw error;
  }
}

/**
 * Get all leads for an agent (client)
 * @param {string} agentId - Retell agent ID
 * @param {string} status - Filter by status (optional)
 */
async function getLeadsByAgent(agentId, status = null) {
  try {
    let query = 'SELECT * FROM leads WHERE agent_id = $1';
    const params = [agentId];

    if (status) {
      query += ' AND status = $2';
      params.push(status);
    }

    query += ' ORDER BY first_call_date DESC';

    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('❌ Get leads error:', error.message);
    throw error;
  }
}

/**
 * Get lead statistics for an agent
 * @param {string} agentId - Retell agent ID
 */
async function getLeadStats(agentId) {
  try {
    const result = await pool.query(
      `SELECT
        COUNT(*) as total_leads,
        COUNT(*) FILTER (WHERE status = 'Approved') as approved,
        COUNT(*) FILTER (WHERE status = 'Denied') as denied,
        COUNT(*) FILTER (WHERE status = 'In Progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'Pending') as pending,
        COUNT(*) FILTER (WHERE conversion_detected = true) as conversions_detected,
        ROUND(
          COUNT(*) FILTER (WHERE status = 'Approved')::numeric /
          NULLIF(COUNT(*), 0) * 100,
          1
        ) as conversion_rate
       FROM leads
       WHERE agent_id = $1`,
      [agentId]
    );

    return result.rows[0];
  } catch (error) {
    console.error('❌ Get lead stats error:', error.message);
    throw error;
  }
}

/**
 * Get all lead statistics across all agents (for admin)
 */
async function getAllLeadStats() {
  try {
    const result = await pool.query(
      `SELECT
        agent_id,
        COUNT(*) as total_leads,
        COUNT(*) FILTER (WHERE status = 'Approved') as approved,
        COUNT(*) FILTER (WHERE status = 'Denied') as denied,
        COUNT(*) FILTER (WHERE status = 'In Progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'Pending') as pending,
        COUNT(*) FILTER (WHERE conversion_detected = true) as conversions_detected,
        ROUND(
          COUNT(*) FILTER (WHERE status = 'Approved')::numeric /
          NULLIF(COUNT(*), 0) * 100,
          1
        ) as conversion_rate
       FROM leads
       GROUP BY agent_id`
    );

    return result.rows;
  } catch (error) {
    console.error('❌ Get all lead stats error:', error.message);
    throw error;
  }
}

/**
 * Search for existing cases by client name (fuzzy match)
 * Used for professional callers (attorneys, medical, insurance) to look up case details
 * @param {string} clientName - Name of the client/patient to search for
 * @param {string} agentId - Agent ID to scope the search
 * @returns {object|null} Matched case details or null
 */
async function searchCaseByName(clientName, agentId) {
  if (!clientName || !agentId) return null;

  // Clean the name for matching
  const searchName = clientName.trim().toLowerCase();
  if (searchName.length < 2) return null;

  try {
    // Search for matching leads using fuzzy matching
    // Prioritize exact matches, then partial matches
    const result = await pool.query(`
      SELECT
        id,
        name,
        phone_number,
        email,
        claim_num,
        case_type,
        incident_date,
        incident_location,
        incident_description,
        status,
        first_call_date,
        case_specific_data,
        -- Calculate match score
        CASE
          WHEN LOWER(name) = $1 THEN 100  -- Exact match
          WHEN LOWER(name) LIKE $2 THEN 80  -- Starts with
          WHEN LOWER(name) LIKE $3 THEN 60  -- Contains
          ELSE 0
        END as match_score
      FROM leads
      WHERE agent_id = $4
        AND name IS NOT NULL
        AND (
          LOWER(name) = $1  -- Exact match
          OR LOWER(name) LIKE $2  -- Starts with
          OR LOWER(name) LIKE $3  -- Contains
        )
      ORDER BY match_score DESC, first_call_date DESC
      LIMIT 1
    `, [
      searchName,
      searchName + '%',
      '%' + searchName + '%',
      agentId
    ]);

    if (result.rows.length === 0) {
      console.log(`   🔍 No matching case found for "${clientName}"`);
      return null;
    }

    const matchedCase = result.rows[0];
    console.log(`   ✅ Found matching case: ${matchedCase.name} (claim: ${matchedCase.claim_num || 'none'}, match: ${matchedCase.match_score}%)`);

    return {
      lead_id: matchedCase.id,
      matched_name: matchedCase.name,
      phone_number: matchedCase.phone_number,
      email: matchedCase.email,
      claim_num: matchedCase.claim_num,
      case_type: matchedCase.case_type,
      incident_date: matchedCase.incident_date,
      incident_location: matchedCase.incident_location,
      incident_description: matchedCase.incident_description,
      status: matchedCase.status,
      case_specific_data: matchedCase.case_specific_data,
      match_score: matchedCase.match_score
    };
  } catch (error) {
    console.error('❌ Case search error:', error.message);
    return null;
  }
}

module.exports = {
  trackLead,
  updateLeadStatus,
  getLeadsByAgent,
  getLeadStats,
  getAllLeadStats,
  searchCaseByName
};

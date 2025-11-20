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

  try {
    // Check if this phone number has any previous calls for this agent
    const previousCalls = await pool.query(
      `SELECT * FROM leads
       WHERE agent_id = $1 AND phone_number = $2
       ORDER BY first_call_date ASC`,
      [agentId, phoneNumber]
    );

    const existingLead = previousCalls.rows[0];
    let conversionDetected = false;
    let isNewLead = false;

    // SCENARIO 1: First time caller
    if (!existingLead) {
      if (category === 'New Lead') {
        // Save new lead
        const result = await pool.query(
          `INSERT INTO leads (
            call_id, agent_id, phone_number, name, email,
            incident_description, category, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *`,
          [
            callId,
            agentId,
            phoneNumber,
            callData.name || (callData.first_name && callData.last_name ? callData.first_name + ' ' + callData.last_name : null),
            callData.email || callData.email_address || null,
            callData.incident_description || callData.summary || callData.purpose || null,
            category,
            'Pending'
          ]
        );

        isNewLead = true;
        console.log(`✅ New lead saved: ${phoneNumber} (${callData.name || 'Unknown'})`);
        return { lead: result.rows[0], isNewLead, conversionDetected };
      } else {
        // First call but not a "New Lead" - just track for history
        console.log(`ℹ️  First call from ${phoneNumber} is category: ${category} (not a New Lead)`);
        return null;
      }
    }

    // SCENARIO 2: Phone number has called before

    // Check if they were previously a "New Lead" and now calling as "Existing Client"
    if (existingLead.category === 'New Lead' && category === 'Existing Client') {
      // CONVERSION DETECTED! 🎉
      conversionDetected = true;

      // Auto-approve the lead since they've converted to an Existing Client
      await pool.query(
        `UPDATE leads
         SET conversion_detected = true,
             conversion_call_id = $1,
             status = 'Approved',
             status_updated_at = CURRENT_TIMESTAMP,
             last_call_date = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [callId, existingLead.id]
      );

      console.log(`🎉 CONVERSION DETECTED! ${existingLead.name || phoneNumber} called back as Existing Client → Auto-approved`);

      return {
        lead: { ...existingLead, conversion_detected: true, conversion_call_id: callId, status: 'Approved' },
        isNewLead: false,
        conversionDetected: true
      };
    }

    // SCENARIO 3: Same category calling again (e.g., New Lead calling back as New Lead)
    if (existingLead.category === category) {
      // Just update last call date
      await pool.query(
        `UPDATE leads
         SET last_call_date = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [existingLead.id]
      );

      console.log(`ℹ️  ${phoneNumber} called again as ${category} (no conversion)`);
      return { lead: existingLead, isNewLead: false, conversionDetected: false };
    }

    // SCENARIO 4: Other category changes (not conversion-worthy)
    console.log(`ℹ️  ${phoneNumber} category changed: ${existingLead.category} → ${category}`);
    return { lead: existingLead, isNewLead: false, conversionDetected: false };

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

module.exports = {
  trackLead,
  updateLeadStatus,
  getLeadsByAgent,
  getLeadStats,
  getAllLeadStats
};

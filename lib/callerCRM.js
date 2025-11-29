// Caller CRM Module
// Handles caller recognition, profile management, and call history
// Maintains full audit trail - never overwrites, always appends with timestamps

const { Pool } = require('pg');

// Use shared pool - will be set by setPool() from server.js
let pool = null;

// Allow server.js to inject the shared pool
function setPool(sharedPool) {
  pool = sharedPool;
  console.log('✅ Caller CRM using shared database pool');
}

// Fallback pool creation if setPool not called (for backwards compatibility)
function getPool() {
  if (!pool) {
    console.log('⚠️  Caller CRM creating own database pool (fallback)');
    pool = new Pool({
      connectionString: process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      max: 10
    });
  }
  return pool;
}

// ============================================
// DATABASE INITIALIZATION
// ============================================

/**
 * Initialize caller CRM tables (run on server startup)
 * IMPORTANT: Callers are scoped by agent_id for security/privacy
 * Each business has its own isolated caller profiles
 */
async function initializeCallerCRM() {
  try {
    // Create callers table - SCOPED BY AGENT_ID for privacy
    await getPool().query(`
      CREATE TABLE IF NOT EXISTS callers (
        id SERIAL PRIMARY KEY,
        phone_number VARCHAR(20) NOT NULL,
        agent_id VARCHAR(255) NOT NULL,
        caller_type VARCHAR(50) DEFAULT 'unknown',
        organization VARCHAR(255),
        preferred_language VARCHAR(20) DEFAULT 'english',
        total_calls INTEGER DEFAULT 1,
        first_call_date TIMESTAMP DEFAULT NOW(),
        last_call_date TIMESTAMP DEFAULT NOW(),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Add agent_id column if it doesn't exist (for existing tables)
    await getPool().query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'callers' AND column_name = 'agent_id') THEN
          ALTER TABLE callers ADD COLUMN agent_id VARCHAR(255);
        END IF;
      END $$;
    `);

    // Create indexes for callers - scoped by agent
    await getPool().query(`CREATE INDEX IF NOT EXISTS idx_callers_phone_agent ON callers(phone_number, agent_id)`);
    await getPool().query(`CREATE INDEX IF NOT EXISTS idx_callers_agent ON callers(agent_id)`);
    await getPool().query(`CREATE INDEX IF NOT EXISTS idx_callers_type ON callers(caller_type)`);

    // Create caller_details table (versioned)
    await getPool().query(`
      CREATE TABLE IF NOT EXISTS caller_details (
        id SERIAL PRIMARY KEY,
        caller_id INTEGER REFERENCES callers(id) ON DELETE CASCADE,
        field_name VARCHAR(50) NOT NULL,
        field_value TEXT,
        source_call_id VARCHAR(255),
        source_type VARCHAR(50),
        confidence VARCHAR(20),
        valid_from TIMESTAMP DEFAULT NOW(),
        valid_until TIMESTAMP,
        recorded_by VARCHAR(255) DEFAULT 'system',
        recorded_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create indexes for caller_details
    await getPool().query(`CREATE INDEX IF NOT EXISTS idx_caller_details_lookup ON caller_details(caller_id, field_name)`);
    await getPool().query(`CREATE INDEX IF NOT EXISTS idx_caller_details_call ON caller_details(source_call_id)`);

    // Create caller_cases table
    await getPool().query(`
      CREATE TABLE IF NOT EXISTS caller_cases (
        id SERIAL PRIMARY KEY,
        caller_id INTEGER REFERENCES callers(id) ON DELETE CASCADE,
        lead_id INTEGER,
        relationship VARCHAR(50) NOT NULL,
        created_from_call_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        is_active BOOLEAN DEFAULT TRUE
      )
    `);

    await getPool().query(`CREATE INDEX IF NOT EXISTS idx_caller_cases_caller ON caller_cases(caller_id)`);

    // Create call_interactions table
    await getPool().query(`
      CREATE TABLE IF NOT EXISTS call_interactions (
        id SERIAL PRIMARY KEY,
        caller_id INTEGER REFERENCES callers(id) ON DELETE SET NULL,
        call_id VARCHAR(255) NOT NULL,
        agent_id VARCHAR(255),
        phone_number VARCHAR(20),
        call_direction VARCHAR(20),
        call_start TIMESTAMP,
        call_end TIMESTAMP,
        duration_seconds INTEGER,
        call_category VARCHAR(50),
        call_outcome VARCHAR(50),
        call_summary TEXT,
        data_collected JSONB,
        fields_updated TEXT[],
        follow_up_needed BOOLEAN DEFAULT FALSE,
        follow_up_reason TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await getPool().query(`CREATE INDEX IF NOT EXISTS idx_call_interactions_caller ON call_interactions(caller_id)`);
    await getPool().query(`CREATE INDEX IF NOT EXISTS idx_call_interactions_phone ON call_interactions(phone_number)`);

    // Create caller_notes table
    await getPool().query(`
      CREATE TABLE IF NOT EXISTS caller_notes (
        id SERIAL PRIMARY KEY,
        caller_id INTEGER REFERENCES callers(id) ON DELETE CASCADE,
        note_type VARCHAR(50),
        note TEXT NOT NULL,
        related_call_id VARCHAR(255),
        related_lead_id INTEGER,
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        is_active BOOLEAN DEFAULT TRUE
      )
    `);

    await getPool().query(`CREATE INDEX IF NOT EXISTS idx_caller_notes_caller ON caller_notes(caller_id)`);

    // ============================================
    // ORGANIZATIONS TABLE (for professional callers)
    // ============================================
    await getPool().query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id SERIAL PRIMARY KEY,
        agent_id VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,  -- 'law_firm', 'insurance', 'medical_office', 'other'
        primary_phone VARCHAR(20),
        additional_phones TEXT[],   -- Array of other known phone numbers
        contact_names TEXT[],       -- Array of individual contacts at this org
        total_calls INTEGER DEFAULT 1,
        first_call_date TIMESTAMP DEFAULT NOW(),
        last_call_date TIMESTAMP DEFAULT NOW(),
        notes TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create indexes for organizations
    await getPool().query(`CREATE INDEX IF NOT EXISTS idx_organizations_agent ON organizations(agent_id)`);
    await getPool().query(`CREATE INDEX IF NOT EXISTS idx_organizations_name ON organizations(name)`);
    await getPool().query(`CREATE INDEX IF NOT EXISTS idx_organizations_type ON organizations(type)`);
    await getPool().query(`CREATE INDEX IF NOT EXISTS idx_organizations_phone ON organizations(primary_phone)`);

    // Add organization_id to callers table if it doesn't exist
    await getPool().query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'callers' AND column_name = 'organization_id') THEN
          ALTER TABLE callers ADD COLUMN organization_id INTEGER REFERENCES organizations(id);
        END IF;
      END $$;
    `);

    await getPool().query(`CREATE INDEX IF NOT EXISTS idx_callers_organization ON callers(organization_id)`);

    console.log('✅ Caller CRM tables initialized (including organizations)');
    return true;
  } catch (error) {
    console.error('❌ Error initializing Caller CRM:', error.message);
    return false;
  }
}

// ============================================
// CALLER LOOKUP & RECOGNITION
// ============================================

/**
 * Look up a caller by phone number (scoped to specific agent/business)
 * Returns their full profile with current values
 * @param {string} phoneNumber - The phone number to look up
 * @param {string} agentId - The agent ID (required for security isolation)
 * @returns {object|null} Caller profile or null if not found
 */
async function lookupCaller(phoneNumber, agentId) {
  if (!phoneNumber || !agentId) return null;

  // Validate phone number has enough digits
  const normalizedPhone = String(phoneNumber).replace(/[\s\-\(\)\+]/g, '');
  if (normalizedPhone.length < 7) {
    console.warn(`⚠️ Phone number too short for lookup: ${phoneNumber}`);
    return null;
  }

  // Handle blocked/private caller IDs
  const blockedPatterns = ['anonymous', 'private', 'blocked', 'unknown', 'restricted'];
  if (blockedPatterns.some(p => String(phoneNumber).toLowerCase().includes(p))) {
    console.log(`📞 Caller ID blocked/private - cannot lookup`);
    return null;
  }

  const phoneVariants = [
    phoneNumber,
    normalizedPhone,
    normalizedPhone.slice(-10), // Last 10 digits
    `+1${normalizedPhone.slice(-10)}` // With country code
  ].filter(Boolean);

  try {
    // Find caller by any phone variant - SCOPED TO THIS AGENT ONLY
    const callerResult = await getPool().query(`
      SELECT * FROM callers
      WHERE phone_number = ANY($1) AND agent_id = $2 AND is_active = TRUE
      ORDER BY last_call_date DESC
      LIMIT 1
    `, [phoneVariants, agentId]);

    if (callerResult.rows.length === 0) {
      return null;
    }

    const caller = callerResult.rows[0];

    // Get current field values
    const detailsResult = await getPool().query(`
      SELECT field_name, field_value, confidence, recorded_at, source_call_id
      FROM caller_details
      WHERE caller_id = $1 AND valid_until IS NULL
      ORDER BY field_name
    `, [caller.id]);

    // Build profile object
    const profile = {
      id: caller.id,
      phoneNumber: caller.phone_number,
      callerType: caller.caller_type,
      organization: caller.organization,
      preferredLanguage: caller.preferred_language,
      totalCalls: caller.total_calls,
      firstCallDate: caller.first_call_date,
      lastCallDate: caller.last_call_date,
      fields: {}
    };

    // Add current field values
    detailsResult.rows.forEach(row => {
      profile.fields[row.field_name] = {
        value: row.field_value,
        confidence: row.confidence,
        recordedAt: row.recorded_at,
        sourceCallId: row.source_call_id
      };
    });

    // Convenience accessors for common fields
    profile.name = profile.fields.name?.value || null;
    profile.email = profile.fields.email?.value || null;
    profile.callbackPhone = profile.fields.callback_phone?.value || null;

    // Get associated cases
    const casesResult = await getPool().query(`
      SELECT cc.*, l.name as case_name, l.incident_date, l.status as case_status
      FROM caller_cases cc
      LEFT JOIN leads l ON cc.lead_id = l.id
      WHERE cc.caller_id = $1 AND cc.is_active = TRUE
      ORDER BY cc.created_at DESC
    `, [caller.id]);

    profile.cases = casesResult.rows.map(row => ({
      leadId: row.lead_id,
      relationship: row.relationship,
      caseName: row.case_name,
      incidentDate: row.incident_date,
      caseStatus: row.case_status
    }));

    // Get recent notes
    const notesResult = await getPool().query(`
      SELECT note_type, note, created_at, created_by
      FROM caller_notes
      WHERE caller_id = $1 AND is_active = TRUE
      ORDER BY created_at DESC
      LIMIT 5
    `, [caller.id]);

    profile.notes = notesResult.rows;

    return profile;
  } catch (error) {
    console.error('❌ Error looking up caller:', error.message);
    return null;
  }
}

/**
 * Get a summary of what we know about a caller (for AI context)
 * @param {string} phoneNumber - The phone number
 * @param {string} agentId - The agent ID (required for security isolation)
 * @returns {object} Summary for AI consumption
 */
async function getCallerContext(phoneNumber, agentId) {
  if (!agentId) {
    return { isKnownCaller: false, context: null, error: 'agent_id required' };
  }
  const profile = await lookupCaller(phoneNumber, agentId);

  if (!profile) {
    return {
      isKnownCaller: false,
      context: null
    };
  }

  // Build context string for AI
  let contextParts = [];

  if (profile.name) {
    contextParts.push(`Caller's name is ${profile.name}`);
  }

  contextParts.push(`This is call #${profile.totalCalls + 1} from this number`);
  contextParts.push(`First called on ${new Date(profile.firstCallDate).toLocaleDateString()}`);

  if (profile.callerType !== 'unknown') {
    contextParts.push(`Caller type: ${profile.callerType}`);
  }

  if (profile.organization) {
    contextParts.push(`Organization: ${profile.organization}`);
  }

  if (profile.email) {
    contextParts.push(`Email on file: ${profile.email}`);
  }

  if (profile.cases && profile.cases.length > 0) {
    const caseList = profile.cases.map(c =>
      `${c.caseName || 'Unknown'} (${c.relationship}, ${c.caseStatus || 'active'})`
    ).join('; ');
    contextParts.push(`Associated cases: ${caseList}`);
  }

  // Recent notes that might be relevant
  const importantNotes = profile.notes?.filter(n =>
    n.note_type === 'warning' || n.note_type === 'preference'
  );
  if (importantNotes?.length > 0) {
    contextParts.push(`Notes: ${importantNotes.map(n => n.note).join('; ')}`);
  }

  // Build what we need to CONFIRM vs ASK
  const fieldsToConfirm = [];
  const fieldsToAsk = [];

  if (profile.name) {
    fieldsToConfirm.push({ field: 'name', value: profile.name });
  } else {
    fieldsToAsk.push('name');
  }

  if (profile.email) {
    fieldsToConfirm.push({ field: 'email', value: profile.email });
  } else {
    fieldsToAsk.push('email');
  }

  if (profile.callbackPhone) {
    fieldsToConfirm.push({ field: 'callback number', value: profile.callbackPhone });
  }

  return {
    isKnownCaller: true,
    callerId: profile.id,
    callerType: profile.callerType,
    totalCalls: profile.totalCalls,
    profile: profile,
    context: contextParts.join('. ') + '.',
    fieldsToConfirm,
    fieldsToAsk,
    hasAssociatedCases: profile.cases?.length > 0,
    cases: profile.cases
  };
}

// ============================================
// CALLER CREATION & UPDATES
// ============================================

/**
 * Create or get a caller record (scoped to specific agent/business)
 * @param {string} phoneNumber - The phone number
 * @param {string} agentId - The agent ID (required for security isolation)
 * @param {string} callId - The Retell call ID
 * @returns {object} Caller record
 */
async function getOrCreateCaller(phoneNumber, agentId, callId = null) {
  if (!phoneNumber || !agentId) return null;

  const normalizedPhone = phoneNumber.replace(/[\s\-\(\)\+]/g, '');

  try {
    // Check if caller exists FOR THIS AGENT
    const existing = await lookupCaller(phoneNumber, agentId);
    if (existing) {
      // Update last call date and increment count
      await getPool().query(`
        UPDATE callers
        SET last_call_date = NOW(),
            total_calls = total_calls + 1,
            updated_at = NOW()
        WHERE id = $1
      `, [existing.id]);

      existing.totalCalls += 1;
      existing.lastCallDate = new Date();
      return existing;
    }

    // Create new caller FOR THIS AGENT
    const result = await getPool().query(`
      INSERT INTO callers (phone_number, agent_id)
      VALUES ($1, $2)
      RETURNING *
    `, [normalizedPhone, agentId]);

    const newCaller = result.rows[0];

    return {
      id: newCaller.id,
      phoneNumber: newCaller.phone_number,
      callerType: 'unknown',
      totalCalls: 1,
      firstCallDate: newCaller.first_call_date,
      lastCallDate: newCaller.last_call_date,
      fields: {},
      cases: [],
      notes: [],
      isNew: true
    };
  } catch (error) {
    console.error('❌ Error creating caller:', error.message);
    return null;
  }
}

/**
 * Update a caller field (preserves history)
 * @param {number} callerId - The caller ID
 * @param {string} fieldName - Field name (e.g., 'name', 'email')
 * @param {string} fieldValue - New value
 * @param {object} options - Additional options
 */
async function updateCallerField(callerId, fieldName, fieldValue, options = {}) {
  const {
    sourceCallId = null,
    sourceType = 'call_transcript',
    confidence = 'stated',
    recordedBy = 'system'
  } = options;

  if (!callerId || !fieldName || !fieldValue) return false;

  try {
    // Check if value is actually different from current
    const current = await getPool().query(`
      SELECT field_value FROM caller_details
      WHERE caller_id = $1 AND field_name = $2 AND valid_until IS NULL
    `, [callerId, fieldName]);

    if (current.rows.length > 0 && current.rows[0].field_value === fieldValue) {
      // Value unchanged, skip update
      return true;
    }

    // Mark old value as superseded
    await getPool().query(`
      UPDATE caller_details
      SET valid_until = NOW()
      WHERE caller_id = $1 AND field_name = $2 AND valid_until IS NULL
    `, [callerId, fieldName]);

    // Insert new value
    await getPool().query(`
      INSERT INTO caller_details
        (caller_id, field_name, field_value, source_call_id, source_type, confidence, recorded_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [callerId, fieldName, fieldValue, sourceCallId, sourceType, confidence, recordedBy]);

    // Update caller's updated_at
    await getPool().query(`UPDATE callers SET updated_at = NOW() WHERE id = $1`, [callerId]);

    console.log(`   📝 Updated caller ${callerId} field "${fieldName}" = "${fieldValue}"`);
    return true;
  } catch (error) {
    console.error('❌ Error updating caller field:', error.message);
    return false;
  }
}

/**
 * Update caller type
 * @param {number} callerId - The caller ID
 * @param {string} callerType - New caller type
 */
async function updateCallerType(callerId, callerType) {
  try {
    await getPool().query(`
      UPDATE callers SET caller_type = $1, updated_at = NOW() WHERE id = $2
    `, [callerType, callerId]);
    return true;
  } catch (error) {
    console.error('❌ Error updating caller type:', error.message);
    return false;
  }
}

/**
 * Check if caller name matches what we have on file
 * Handles family members sharing a phone
 * @param {number} callerId - The caller ID
 * @param {string} providedName - Name the caller gave
 * @param {string} callId - Source call ID
 * @returns {object} Match result with action recommendation
 */
async function checkNameMatch(callerId, providedName, callId) {
  if (!callerId || !providedName) {
    return { match: false, action: 'ask_name' };
  }

  try {
    // Get current name on file
    const result = await getPool().query(`
      SELECT field_value FROM caller_details
      WHERE caller_id = $1 AND field_name = 'name' AND valid_until IS NULL
    `, [callerId]);

    if (result.rows.length === 0) {
      // No name on file - this is new info
      return { match: false, action: 'save_name', isNewInfo: true };
    }

    const storedName = result.rows[0].field_value.toLowerCase().trim();
    const givenName = providedName.toLowerCase().trim();

    // Exact match
    if (storedName === givenName) {
      return { match: true, action: 'confirmed', storedName: result.rows[0].field_value };
    }

    // Partial match (first name matches, might be nickname or shortened)
    const storedFirst = storedName.split(' ')[0];
    const givenFirst = givenName.split(' ')[0];

    if (storedFirst === givenFirst) {
      // Likely same person, minor variation
      return { match: true, action: 'partial_match', storedName: result.rows[0].field_value };
    }

    // Names don't match - could be family member
    // Add a note about this
    await addCallerNote(callerId,
      `Different name provided: "${providedName}" (previous: "${result.rows[0].field_value}"). May be family member sharing phone.`,
      { noteType: 'info', relatedCallId: callId, createdBy: 'system' }
    );

    return {
      match: false,
      action: 'different_person',
      storedName: result.rows[0].field_value,
      suggestion: 'May be family member sharing this phone number'
    };
  } catch (error) {
    console.error('❌ Error checking name match:', error.message);
    return { match: false, action: 'error' };
  }
}

/**
 * Handle when caller corrects information we have on file
 * Logs the correction and updates the record
 * @param {number} callerId - The caller ID
 * @param {string} fieldName - Field being corrected
 * @param {string} oldValue - What we had
 * @param {string} newValue - What caller says is correct
 * @param {string} callId - Source call ID
 */
async function handleCorrection(callerId, fieldName, oldValue, newValue, callId) {
  try {
    // Add note about the correction
    await addCallerNote(callerId,
      `${fieldName} corrected: "${oldValue}" → "${newValue}"`,
      { noteType: 'correction', relatedCallId: callId, createdBy: 'caller' }
    );

    // Update the field with 'corrected' confidence
    await updateCallerField(callerId, fieldName, newValue, {
      sourceCallId: callId,
      sourceType: 'caller_correction',
      confidence: 'corrected'
    });

    return true;
  } catch (error) {
    console.error('❌ Error handling correction:', error.message);
    return false;
  }
}

/**
 * Update multiple fields at once from call data
 * @param {number} callerId - The caller ID
 * @param {object} data - Object with field values
 * @param {string} callId - Source call ID
 */
async function updateCallerFromCallData(callerId, data, callId) {
  if (!callerId || !data) return;

  const fieldMappings = {
    name: 'name',
    first_name: 'first_name',
    last_name: 'last_name',
    email: 'email',
    email_address: 'email',
    phone: 'callback_phone',
    callback_phone: 'callback_phone',
    address: 'address',
    preferred_language: 'preferred_language'
  };

  const updates = [];

  for (const [dataKey, fieldName] of Object.entries(fieldMappings)) {
    if (data[dataKey] && typeof data[dataKey] === 'string' && data[dataKey].trim()) {
      updates.push(
        updateCallerField(callerId, fieldName, data[dataKey].trim(), {
          sourceCallId: callId,
          sourceType: 'ai_extraction',
          confidence: 'stated'
        })
      );
    }
  }

  // Handle combined name
  if (data.first_name && data.last_name && !data.name) {
    updates.push(
      updateCallerField(callerId, 'name', `${data.first_name} ${data.last_name}`.trim(), {
        sourceCallId: callId,
        sourceType: 'ai_extraction',
        confidence: 'stated'
      })
    );
  }

  await Promise.all(updates);
}

// ============================================
// CALL INTERACTION LOGGING
// ============================================

/**
 * Log a call interaction
 * @param {object} callData - Call data to log
 */
async function logCallInteraction(callData) {
  const {
    callerId,
    callId,
    agentId,
    phoneNumber,
    direction = 'inbound',
    startTime,
    endTime,
    durationSeconds,
    category,
    outcome,
    summary,
    dataCollected,
    fieldsUpdated
  } = callData;

  try {
    await getPool().query(`
      INSERT INTO call_interactions (
        caller_id, call_id, agent_id, phone_number,
        call_direction, call_start, call_end, duration_seconds,
        call_category, call_outcome, call_summary,
        data_collected, fields_updated
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (call_id) DO UPDATE SET
        call_end = EXCLUDED.call_end,
        duration_seconds = EXCLUDED.duration_seconds,
        call_category = EXCLUDED.call_category,
        call_outcome = EXCLUDED.call_outcome,
        call_summary = EXCLUDED.call_summary,
        data_collected = EXCLUDED.data_collected,
        fields_updated = EXCLUDED.fields_updated
    `, [
      callerId, callId, agentId, phoneNumber,
      direction, startTime, endTime, durationSeconds,
      category, outcome, summary,
      dataCollected ? JSON.stringify(dataCollected) : null,
      fieldsUpdated
    ]);

    return true;
  } catch (error) {
    console.error('❌ Error logging call interaction:', error.message);
    return false;
  }
}

// ============================================
// CASE ASSOCIATIONS
// ============================================

/**
 * Link a caller to a case/lead
 * @param {number} callerId - The caller ID
 * @param {number} leadId - The lead/case ID
 * @param {string} relationship - Relationship type
 * @param {string} callId - Source call ID
 */
async function linkCallerToCase(callerId, leadId, relationship, callId = null) {
  try {
    await getPool().query(`
      INSERT INTO caller_cases (caller_id, lead_id, relationship, created_from_call_id)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (caller_id, lead_id, relationship) DO NOTHING
    `, [callerId, leadId, relationship, callId]);
    return true;
  } catch (error) {
    console.error('❌ Error linking caller to case:', error.message);
    return false;
  }
}

/**
 * Get cases for a caller
 * @param {number} callerId - The caller ID
 */
async function getCallerCases(callerId) {
  try {
    const result = await getPool().query(`
      SELECT cc.*, l.name, l.phone_number, l.incident_date, l.incident_description, l.status
      FROM caller_cases cc
      LEFT JOIN leads l ON cc.lead_id = l.id
      WHERE cc.caller_id = $1 AND cc.is_active = TRUE
      ORDER BY cc.created_at DESC
    `, [callerId]);
    return result.rows;
  } catch (error) {
    console.error('❌ Error getting caller cases:', error.message);
    return [];
  }
}

// ============================================
// CALLER NOTES
// ============================================

/**
 * Add a note to a caller
 * @param {number} callerId - The caller ID
 * @param {string} note - The note content
 * @param {object} options - Additional options
 */
async function addCallerNote(callerId, note, options = {}) {
  const {
    noteType = 'general',
    relatedCallId = null,
    relatedLeadId = null,
    createdBy = 'system'
  } = options;

  try {
    await getPool().query(`
      INSERT INTO caller_notes (caller_id, note_type, note, related_call_id, related_lead_id, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [callerId, noteType, note, relatedCallId, relatedLeadId, createdBy]);
    return true;
  } catch (error) {
    console.error('❌ Error adding caller note:', error.message);
    return false;
  }
}

// ============================================
// FIELD HISTORY
// ============================================

/**
 * Get the history of a field for a caller
 * @param {number} callerId - The caller ID
 * @param {string} fieldName - The field name
 */
async function getFieldHistory(callerId, fieldName) {
  try {
    const result = await getPool().query(`
      SELECT field_value, valid_from, valid_until, source_call_id, confidence, recorded_by
      FROM caller_details
      WHERE caller_id = $1 AND field_name = $2
      ORDER BY recorded_at DESC
    `, [callerId, fieldName]);
    return result.rows;
  } catch (error) {
    console.error('❌ Error getting field history:', error.message);
    return [];
  }
}

// ============================================
// ORGANIZATION MANAGEMENT
// ============================================

/**
 * Look up an organization by phone number
 * Checks both primary_phone and additional_phones array
 * @param {string} phoneNumber - The phone number to search
 * @param {string} agentId - The agent ID for scoping
 * @returns {object|null} Organization or null if not found
 */
async function lookupOrganization(phoneNumber, agentId) {
  if (!phoneNumber || !agentId) return null;

  const normalizedPhone = String(phoneNumber).replace(/[\s\-\(\)\+]/g, '');
  if (normalizedPhone.length < 7) return null;

  const phoneVariants = [
    phoneNumber,
    normalizedPhone,
    normalizedPhone.slice(-10),
    `+1${normalizedPhone.slice(-10)}`
  ].filter(Boolean);

  try {
    // Check primary_phone and additional_phones array
    const result = await getPool().query(`
      SELECT * FROM organizations
      WHERE agent_id = $1
        AND is_active = TRUE
        AND (
          primary_phone = ANY($2)
          OR additional_phones && $2::text[]
        )
      ORDER BY last_call_date DESC
      LIMIT 1
    `, [agentId, phoneVariants]);

    if (result.rows.length === 0) return null;

    const org = result.rows[0];
    return {
      id: org.id,
      name: org.name,
      type: org.type,
      primaryPhone: org.primary_phone,
      additionalPhones: org.additional_phones || [],
      contactNames: org.contact_names || [],
      totalCalls: org.total_calls,
      firstCallDate: org.first_call_date,
      lastCallDate: org.last_call_date,
      notes: org.notes
    };
  } catch (error) {
    console.error('❌ Error looking up organization:', error.message);
    return null;
  }
}

/**
 * Get or create an organization
 * @param {object} orgData - Organization data
 * @param {string} agentId - Agent ID for scoping
 * @returns {object} Organization record
 */
async function getOrCreateOrganization(orgData, agentId) {
  const { name, type, phoneNumber, contactName } = orgData;

  if (!name || !type || !agentId) {
    console.warn('⚠️ Missing required org data: name, type, or agentId');
    return null;
  }

  try {
    // First try to find by phone number
    if (phoneNumber) {
      const existing = await lookupOrganization(phoneNumber, agentId);
      if (existing) {
        // Update last call date and increment count
        await getPool().query(`
          UPDATE organizations
          SET last_call_date = NOW(),
              total_calls = total_calls + 1,
              updated_at = NOW()
          WHERE id = $1
        `, [existing.id]);

        // Add contact name if new
        if (contactName && !existing.contactNames.includes(contactName)) {
          await getPool().query(`
            UPDATE organizations
            SET contact_names = array_append(COALESCE(contact_names, '{}'), $1)
            WHERE id = $2
          `, [contactName, existing.id]);
          existing.contactNames.push(contactName);
        }

        existing.totalCalls += 1;
        return existing;
      }
    }

    // Try to find by name (fuzzy match)
    const nameResult = await getPool().query(`
      SELECT * FROM organizations
      WHERE agent_id = $1
        AND is_active = TRUE
        AND LOWER(name) = LOWER($2)
      LIMIT 1
    `, [agentId, name]);

    if (nameResult.rows.length > 0) {
      const org = nameResult.rows[0];

      // Update with new phone if provided
      if (phoneNumber) {
        const normalizedPhone = phoneNumber.replace(/[\s\-\(\)\+]/g, '');
        const phones = org.additional_phones || [];
        if (!phones.includes(normalizedPhone) && org.primary_phone !== normalizedPhone) {
          await getPool().query(`
            UPDATE organizations
            SET additional_phones = array_append(COALESCE(additional_phones, '{}'), $1),
                updated_at = NOW()
            WHERE id = $2
          `, [normalizedPhone, org.id]);
        }
      }

      // Update last call
      await getPool().query(`
        UPDATE organizations
        SET last_call_date = NOW(),
            total_calls = total_calls + 1,
            updated_at = NOW()
        WHERE id = $1
      `, [org.id]);

      return {
        id: org.id,
        name: org.name,
        type: org.type,
        primaryPhone: org.primary_phone,
        totalCalls: org.total_calls + 1,
        isExisting: true
      };
    }

    // Create new organization
    const normalizedPhone = phoneNumber ? phoneNumber.replace(/[\s\-\(\)\+]/g, '') : null;
    const contactNames = contactName ? [contactName] : [];

    const insertResult = await getPool().query(`
      INSERT INTO organizations (agent_id, name, type, primary_phone, contact_names)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [agentId, name, type, normalizedPhone, contactNames]);

    const newOrg = insertResult.rows[0];
    console.log(`   🏢 Created new organization: ${name} (${type})`);

    return {
      id: newOrg.id,
      name: newOrg.name,
      type: newOrg.type,
      primaryPhone: newOrg.primary_phone,
      totalCalls: 1,
      isNew: true
    };
  } catch (error) {
    console.error('❌ Error getting/creating organization:', error.message);
    return null;
  }
}

/**
 * Link a caller to an organization
 * @param {number} callerId - The caller ID
 * @param {number} organizationId - The organization ID
 */
async function linkCallerToOrganization(callerId, organizationId) {
  if (!callerId || !organizationId) return false;

  try {
    await getPool().query(`
      UPDATE callers
      SET organization_id = $1, updated_at = NOW()
      WHERE id = $2
    `, [organizationId, callerId]);

    console.log(`   🔗 Linked caller ${callerId} to organization ${organizationId}`);
    return true;
  } catch (error) {
    console.error('❌ Error linking caller to organization:', error.message);
    return false;
  }
}

/**
 * Get organization context for a caller (used in inbound webhook)
 * @param {string} phoneNumber - Phone number
 * @param {string} agentId - Agent ID
 * @returns {object} Organization context for AI
 */
async function getOrganizationContext(phoneNumber, agentId) {
  const org = await lookupOrganization(phoneNumber, agentId);

  if (!org) {
    return {
      hasOrganization: false,
      organizationName: '',
      organizationType: '',
      organizationCallCount: 0
    };
  }

  return {
    hasOrganization: true,
    organizationId: org.id,
    organizationName: org.name,
    organizationType: org.type,
    organizationCallCount: org.totalCalls,
    organizationContacts: org.contactNames || [],
    organizationNotes: org.notes || ''
  };
}

/**
 * Map caller type to organization type
 */
function callerTypeToOrgType(callerType) {
  const mapping = {
    'attorney': 'law_firm',
    'Attorney': 'law_firm',
    'medical': 'medical_office',
    'Medical': 'medical_office',
    'Medical Professional': 'medical_office',
    'insurance': 'insurance',
    'Insurance': 'insurance',
    'other': 'other',
    'Other': 'other'
  };
  return mapping[callerType] || 'other';
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  setPool,
  initializeCallerCRM,
  lookupCaller,
  getCallerContext,
  getOrCreateCaller,
  updateCallerField,
  updateCallerType,
  checkNameMatch,
  handleCorrection,
  updateCallerFromCallData,
  logCallInteraction,
  linkCallerToCase,
  getCallerCases,
  addCallerNote,
  getFieldHistory,
  // Organization functions
  lookupOrganization,
  getOrCreateOrganization,
  linkCallerToOrganization,
  getOrganizationContext,
  callerTypeToOrgType
};

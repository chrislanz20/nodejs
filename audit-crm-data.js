// CRM Data Audit Script
// Compares extracted CRM data against actual call transcripts

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

// CourtLaw agent IDs
const AGENT_IDS = [
  'agent_f2bc1ab69af57533174f607ab8', // CourtLaw Dec
  'agent_e0d59cb68ba606e4a1d01c33db'  // CourtLaw (older)
];

async function auditCRMData() {
  console.log('='.repeat(80));
  console.log('CRM DATA AUDIT - Verifying extracted data against call transcripts');
  console.log('='.repeat(80));
  console.log();

  try {
    // 1. Check recent calls from call_logs
    console.log('📞 RECENT CALLS (last 20):');
    console.log('-'.repeat(80));

    const recentCalls = await pool.query(`
      SELECT
        call_id,
        from_number,
        to_number,
        call_start,
        duration,
        transcript,
        extracted_data
      FROM call_logs
      WHERE agent_id = ANY($1)
      ORDER BY call_start DESC
      LIMIT 20
    `, [AGENT_IDS]);

    console.log(`Found ${recentCalls.rows.length} recent calls\n`);

    // 2. Check call_categories for extracted info
    console.log('📊 CALL CATEGORIES (with extracted data):');
    console.log('-'.repeat(80));

    const categories = await pool.query(`
      SELECT
        call_id,
        category,
        name,
        phone_number,
        claim_number,
        case_name,
        who_representing,
        email,
        purpose,
        created_at
      FROM call_categories
      WHERE agent_id = ANY($1)
      ORDER BY created_at DESC
      LIMIT 30
    `, [AGENT_IDS]);

    console.log(`Found ${categories.rows.length} categorized calls\n`);

    // 3. Audit claim numbers - check if they match transcript
    console.log('🔍 CLAIM NUMBER AUDIT:');
    console.log('-'.repeat(80));

    const callsWithClaims = categories.rows.filter(c => c.claim_number);
    console.log(`Found ${callsWithClaims.length} calls with claim numbers\n`);

    for (const call of callsWithClaims) {
      console.log(`Call ID: ${call.call_id?.substring(0, 30)}...`);
      console.log(`  Category: ${call.category}`);
      console.log(`  Name: ${call.name}`);
      console.log(`  Claim #: ${call.claim_number}`);
      console.log(`  Case/Client: ${call.case_name || call.who_representing || 'N/A'}`);
      console.log(`  Date: ${call.created_at}`);

      // Try to get transcript for this call
      const transcriptResult = await pool.query(`
        SELECT transcript FROM call_logs WHERE call_id = $1
      `, [call.call_id]);

      if (transcriptResult.rows.length > 0 && transcriptResult.rows[0].transcript) {
        const transcript = transcriptResult.rows[0].transcript;
        const transcriptText = typeof transcript === 'string'
          ? transcript
          : JSON.stringify(transcript);

        // Check if claim number appears in transcript
        const claimInTranscript = transcriptText.toLowerCase().includes(
          call.claim_number.toLowerCase().replace(/[^a-z0-9]/gi, '')
        );

        console.log(`  ✓ In Transcript: ${claimInTranscript ? 'YES' : '⚠️  NOT FOUND'}`);

        if (!claimInTranscript) {
          // Show snippet of transcript for manual review
          console.log(`  📝 Transcript preview: ${transcriptText.substring(0, 200)}...`);
        }
      } else {
        console.log(`  ⚠️  No transcript found for this call`);
      }
      console.log();
    }

    // 4. Check CRM tables directly
    console.log('👥 CRM CALLERS TABLE:');
    console.log('-'.repeat(80));

    const callers = await pool.query(`
      SELECT
        c.id,
        c.phone_number,
        c.caller_type,
        c.organization,
        c.total_calls,
        c.last_call_date
      FROM callers c
      WHERE c.agent_id = ANY($1)
      ORDER BY c.last_call_date DESC
      LIMIT 20
    `, [AGENT_IDS]);

    console.log(`Found ${callers.rows.length} callers in CRM\n`);

    for (const caller of callers.rows) {
      console.log(`ID: ${caller.id} | ${caller.phone_number} | Type: ${caller.caller_type} | Org: ${caller.organization || 'N/A'} | Calls: ${caller.total_calls}`);
    }

    // 5. Check caller_details for claim numbers
    console.log('\n📋 CALLER DETAILS (claim numbers):');
    console.log('-'.repeat(80));

    const claimDetails = await pool.query(`
      SELECT
        cd.caller_id,
        cd.field_name,
        cd.field_value,
        cd.source_call_id,
        cd.confidence,
        cd.recorded_at,
        c.phone_number
      FROM caller_details cd
      JOIN callers c ON cd.caller_id = c.id
      WHERE cd.field_name = 'claim_number'
        AND c.agent_id = ANY($1)
      ORDER BY cd.recorded_at DESC
      LIMIT 20
    `, [AGENT_IDS]);

    console.log(`Found ${claimDetails.rows.length} claim numbers in caller_details\n`);

    for (const detail of claimDetails.rows) {
      console.log(`Caller ${detail.caller_id} (${detail.phone_number}): ${detail.field_value} | Confidence: ${detail.confidence || 'N/A'}`);
    }

    // 6. Check organizations
    console.log('\n🏢 ORGANIZATIONS:');
    console.log('-'.repeat(80));

    const orgs = await pool.query(`
      SELECT
        id,
        name,
        org_type,
        primary_phone,
        total_calls,
        created_at
      FROM organizations
      WHERE agent_id = ANY($1)
      ORDER BY total_calls DESC
      LIMIT 20
    `, [AGENT_IDS]);

    console.log(`Found ${orgs.rows.length} organizations\n`);

    for (const org of orgs.rows) {
      console.log(`${org.name} | Type: ${org.org_type} | Phone: ${org.primary_phone} | Calls: ${org.total_calls}`);
    }

    // 7. Check if recent calls are being saved to CRM
    console.log('\n⚡ RECENT CALL → CRM SYNC CHECK:');
    console.log('-'.repeat(80));

    // Get last 5 calls and check if they have CRM entries
    for (const call of recentCalls.rows.slice(0, 5)) {
      const phone = call.from_number;
      const callDate = call.call_start;

      // Check if this phone has a caller entry
      const callerCheck = await pool.query(`
        SELECT id, total_calls, last_call_date FROM callers
        WHERE phone_number = $1 AND agent_id = ANY($2)
      `, [phone, AGENT_IDS]);

      console.log(`\nCall from ${phone} at ${callDate}:`);
      if (callerCheck.rows.length > 0) {
        const caller = callerCheck.rows[0];
        console.log(`  ✅ Found in CRM (ID: ${caller.id}, Total calls: ${caller.total_calls})`);

        // Check if last_call_date matches
        const lastCallDate = new Date(caller.last_call_date);
        const thisCallDate = new Date(callDate);
        const timeDiff = Math.abs(lastCallDate - thisCallDate) / 1000 / 60; // minutes

        if (timeDiff < 60) {
          console.log(`  ✅ Last call date synced (within 1 hour)`);
        } else {
          console.log(`  ⚠️  Last call date mismatch: CRM shows ${caller.last_call_date}`);
        }
      } else {
        console.log(`  ⚠️  NOT in CRM callers table`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('AUDIT COMPLETE');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('Audit error:', error);
  } finally {
    await pool.end();
  }
}

auditCRMData();

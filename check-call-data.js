// Check what call data is stored in the app database
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkCallData() {
  try {
    // Check call_categories columns
    console.log('📊 CALL_CATEGORIES TABLE STRUCTURE:');
    const cols = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'call_categories'
      ORDER BY ordinal_position
    `);
    console.log('Columns:', cols.rows.map(c => `${c.column_name} (${c.data_type})`).join(', '));
    console.log();

    // Get a sample call with all data
    console.log('📞 SAMPLE CALL (full data):');
    const sample = await pool.query(`
      SELECT *
      FROM call_categories
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (sample.rows.length > 0) {
      console.log(JSON.stringify(sample.rows[0], null, 2));
    }
    console.log();

    // Get recent calls with claim numbers - check what columns exist first
    const sampleRow = await pool.query('SELECT * FROM call_categories LIMIT 1');
    const availableCols = Object.keys(sampleRow.rows[0] || {});
    console.log('Available columns:', availableCols.join(', '));
    console.log();

    // Check if claim_number column exists
    if (availableCols.includes('claim_number')) {
      console.log('📋 RECENT CALLS WITH CLAIM NUMBERS:');
      console.log('-'.repeat(100));

      const claims = await pool.query(`
        SELECT *
        FROM call_categories
        WHERE claim_number IS NOT NULL
          AND claim_number != ''
        ORDER BY created_at DESC
        LIMIT 30
      `);

      console.log(`Found ${claims.rows.length} calls with claim numbers\n`);

      for (const call of claims.rows) {
        console.log(`Date: ${call.created_at}`);
        console.log(`  Category: ${call.category}`);
        console.log(`  Name: ${call.name || 'N/A'}`);
        console.log(`  Phone: ${call.phone_number || 'N/A'}`);
        console.log(`  Claim #: ${call.claim_number}`);
        console.log(`  Case/Client: ${call.case_name || call.who_representing || 'N/A'}`);
        console.log(`  Purpose: ${(call.purpose || call.reasoning || '').substring(0, 100)}...`);
        console.log(`  Call ID: ${call.call_id?.substring(0, 40)}...`);
        console.log();
      }
    } else {
      console.log('❌ claim_number column not found in call_categories');
    }

    // Check call_interactions table
    console.log('\n📞 CALL_INTERACTIONS TABLE:');
    try {
      const interCols = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'call_interactions'
        ORDER BY ordinal_position
      `);
      console.log('Columns:', interCols.rows.map(c => c.column_name).join(', '));

      const interCount = await pool.query('SELECT COUNT(*) as count FROM call_interactions');
      console.log('Total rows:', interCount.rows[0].count);

      // Sample
      const interSample = await pool.query('SELECT * FROM call_interactions ORDER BY created_at DESC LIMIT 3');
      console.log('\nRecent interactions:');
      for (const i of interSample.rows) {
        console.log(`  ${i.created_at}: ${i.call_id?.substring(0, 30) || 'N/A'}`);
        console.log(`    Name: ${i.caller_name || i.name || 'N/A'}, Phone: ${i.phone_number || 'N/A'}`);
        if (i.claim_number) console.log(`    Claim #: ${i.claim_number}`);
      }
    } catch (e) {
      console.log('Error:', e.message);
    }

    // Check callers table
    console.log('\n👥 CALLERS TABLE:');
    try {
      const callerCols = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'callers'
        ORDER BY ordinal_position
      `);
      console.log('Columns:', callerCols.rows.map(c => c.column_name).join(', '));

      const recentCallers = await pool.query(`
        SELECT * FROM callers
        ORDER BY last_call_date DESC
        LIMIT 10
      `);
      console.log(`\nRecent callers (${recentCallers.rows.length}):`);
      for (const c of recentCallers.rows) {
        console.log(`  ${c.phone_number} | Type: ${c.caller_type} | Org: ${c.organization || 'N/A'} | Calls: ${c.total_calls}`);
      }
    } catch (e) {
      console.log('Error:', e.message);
    }

    // Check caller_details for claim numbers
    console.log('\n📋 CALLER_DETAILS (claim numbers):');
    try {
      const claimDetails = await pool.query(`
        SELECT
          cd.field_value as claim_number,
          cd.source_call_id,
          cd.confidence,
          cd.recorded_at,
          c.phone_number,
          c.caller_type,
          c.organization
        FROM caller_details cd
        JOIN callers c ON cd.caller_id = c.id
        WHERE cd.field_name = 'claim_number'
        ORDER BY cd.recorded_at DESC
        LIMIT 20
      `);

      console.log(`Found ${claimDetails.rows.length} claim numbers\n`);
      for (const d of claimDetails.rows) {
        console.log(`  ${d.phone_number} | Claim: ${d.claim_number} | Type: ${d.caller_type} | Org: ${d.organization || 'N/A'}`);
        console.log(`    Source call: ${d.source_call_id?.substring(0, 40) || 'N/A'}...`);
      }
    } catch (e) {
      console.log('Error:', e.message);
    }

    // Check clients
    console.log('\n👤 CLIENTS TABLE:');
    try {
      const clientCols = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'clients'
        ORDER BY ordinal_position
      `);
      console.log('Columns:', clientCols.rows.map(c => c.column_name).join(', '));

      const clients = await pool.query(`
        SELECT * FROM clients
        ORDER BY created_at DESC
        LIMIT 10
      `);
      console.log(`\nRecent clients (${clients.rows.length}):`);
      for (const c of clients.rows) {
        console.log(`  ${c.name || 'N/A'} | Phone: ${c.phone || 'N/A'} | Claim: ${c.claim_number || 'N/A'} | Type: ${c.case_type || 'N/A'}`);
      }
    } catch (e) {
      console.log('Error:', e.message);
    }

    // Check activity_log
    console.log('\n📋 ACTIVITY_LOG (recent webhook activity):');
    try {
      const activity = await pool.query(`
        SELECT action, call_id, details, created_at
        FROM activity_log
        ORDER BY created_at DESC
        LIMIT 10
      `);
      for (const a of activity.rows) {
        console.log(`${a.created_at}: ${a.action} - ${a.call_id?.substring(0, 30) || 'N/A'}`);
      }
    } catch (e) {
      console.log('Error:', e.message);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkCallData();

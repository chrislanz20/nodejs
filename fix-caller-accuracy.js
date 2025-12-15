// Fix caller data accuracy issues
// - Remove miscategorized callers (professionals that got marked as clients)
// - Fix data quality issues with verified corrections

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

const COURTLAW_AGENT_ID = 'agent_8e50b96f7e7bb7ce7479219fcc';

// IDs of callers that are actually professionals (not existing clients)
// These should be removed from the callers table
const MISCATEGORIZED_CALLER_IDS = [
  163, // Vanessa from ESC Doctors - MEDICAL professional
  166, // Kelly from Progressive - INSURANCE
  167, // Karen Ksopko from GEICO - ATTORNEY
  172, // Ricardo from Hudson Regional Hospital - MEDICAL
  174, // Tyran Basel from Helmsman TPA - INSURANCE
  175, // George Diaz from Progressive - INSURANCE
  177, // Avinash from Rawlings/Aetna - INSURANCE
];

// Corrections for existing clients with bad data
const CALLER_CORRECTIONS = [
  { id: 170, name: 'John Pope', phone: '+18456641088', callback: '845-664-1088' },
  { id: 171, name: 'Sheena Johnson', phone: '+19082663618', callback: '908-266-3618', email: 'sheenaj745@gmail.com' },
  { id: 178, name: 'Jimmy', phone: '+17325068855', callback: '732-506-8855' }, // Last name unclear from transcript
  { id: 181, name: null }, // Transcript was garbled, remove name
  { id: 183, name: 'Ana Ramirez', email: 'anaramirez747@gmail.com' },
  { id: 184, name: 'Johnnie Mae', phone: '+19086037914', callback: '908-603-7914' },
  { id: 191, name: 'Alfonso', phone: '+18486788790', callback: '848-213-3076' },
  { id: 207, name: 'Gabriel Jensen Cuevas Encarnación', email: 'gabrielcuevas402@gmail.com' },
  { id: 219, callback: '347-942-4729', claim_num: 'PASL-2141-22' }, // Converted from Spanish
];

// New leads that are actually professionals
const MISCATEGORIZED_LEAD_IDS = [
  164, // Danielle Mintz from Capehart - ATTORNEY
];

async function fixAccuracy() {
  console.log('\n🔧 Fixing Caller Data Accuracy Issues...\n');

  try {
    // Step 1: Remove miscategorized callers
    console.log('Step 1: Removing miscategorized callers (professionals marked as clients)...');

    for (const id of MISCATEGORIZED_CALLER_IDS) {
      // First get the caller info for logging
      const info = await pool.query('SELECT phone_number FROM callers WHERE id = $1', [id]);
      if (info.rows.length > 0) {
        console.log(`   Removing caller ${id} (${info.rows[0].phone_number}) - was a professional, not a client`);

        // Delete caller details first (foreign key constraint)
        await pool.query('DELETE FROM caller_details WHERE caller_id = $1', [id]);
        // Delete caller
        await pool.query('DELETE FROM callers WHERE id = $1', [id]);
      }
    }
    console.log(`   ✅ Removed ${MISCATEGORIZED_CALLER_IDS.length} miscategorized callers\n`);

    // Step 2: Apply corrections to existing clients
    console.log('Step 2: Applying corrections to existing client data...');

    for (const correction of CALLER_CORRECTIONS) {
      const caller = await pool.query('SELECT id FROM callers WHERE id = $1', [correction.id]);
      if (caller.rows.length === 0) {
        console.log(`   ⚠️ Caller ${correction.id} not found, skipping`);
        continue;
      }

      if (correction.name !== undefined) {
        if (correction.name === null) {
          // Remove the name field
          await pool.query('DELETE FROM caller_details WHERE caller_id = $1 AND field_name = $2',
            [correction.id, 'name']);
          console.log(`   📝 Removed bad name for caller ${correction.id}`);
        } else {
          // Update the name
          const existing = await pool.query(
            'SELECT id FROM caller_details WHERE caller_id = $1 AND field_name = $2',
            [correction.id, 'name']
          );
          if (existing.rows.length > 0) {
            await pool.query(
              'UPDATE caller_details SET field_value = $1 WHERE caller_id = $2 AND field_name = $3',
              [correction.name, correction.id, 'name']
            );
          } else {
            await pool.query(
              'INSERT INTO caller_details (caller_id, field_name, field_value, confidence) VALUES ($1, $2, $3, $4)',
              [correction.id, 'name', correction.name, 'manually_verified']
            );
          }
          console.log(`   📝 Updated name for caller ${correction.id}: "${correction.name}"`);
        }
      }

      if (correction.callback) {
        const existing = await pool.query(
          'SELECT id FROM caller_details WHERE caller_id = $1 AND field_name = $2',
          [correction.id, 'callback_phone']
        );
        if (existing.rows.length > 0) {
          await pool.query(
            'UPDATE caller_details SET field_value = $1 WHERE caller_id = $2 AND field_name = $3',
            [correction.callback, correction.id, 'callback_phone']
          );
        }
        console.log(`   📝 Updated callback for caller ${correction.id}: "${correction.callback}"`);
      }

      if (correction.email) {
        const existing = await pool.query(
          'SELECT id FROM caller_details WHERE caller_id = $1 AND field_name = $2',
          [correction.id, 'email']
        );
        if (existing.rows.length > 0) {
          await pool.query(
            'UPDATE caller_details SET field_value = $1 WHERE caller_id = $2 AND field_name = $3',
            [correction.email, correction.id, 'email']
          );
        } else {
          await pool.query(
            'INSERT INTO caller_details (caller_id, field_name, field_value, confidence) VALUES ($1, $2, $3, $4)',
            [correction.id, 'email', correction.email, 'manually_verified']
          );
        }
        console.log(`   📝 Updated email for caller ${correction.id}: "${correction.email}"`);
      }

      if (correction.claim_num) {
        const existing = await pool.query(
          'SELECT id FROM caller_details WHERE caller_id = $1 AND field_name = $2',
          [correction.id, 'claim_num']
        );
        if (existing.rows.length > 0) {
          await pool.query(
            'UPDATE caller_details SET field_value = $1 WHERE caller_id = $2 AND field_name = $3',
            [correction.claim_num, correction.id, 'claim_num']
          );
        }
        console.log(`   📝 Updated claim_num for caller ${correction.id}: "${correction.claim_num}"`);
      }
    }
    console.log(`   ✅ Applied ${CALLER_CORRECTIONS.length} corrections\n`);

    // Step 3: Remove miscategorized leads
    console.log('Step 3: Removing miscategorized leads (professionals marked as new leads)...');

    for (const id of MISCATEGORIZED_LEAD_IDS) {
      const info = await pool.query('SELECT phone_number FROM callers WHERE id = $1', [id]);
      if (info.rows.length > 0) {
        console.log(`   Removing caller ${id} (${info.rows[0].phone_number}) - was a professional, not a lead`);
        await pool.query('DELETE FROM caller_details WHERE caller_id = $1', [id]);
        await pool.query('DELETE FROM callers WHERE id = $1', [id]);
      }
    }
    console.log(`   ✅ Removed ${MISCATEGORIZED_LEAD_IDS.length} miscategorized leads\n`);

    // Print final counts
    const existingClients = await pool.query(
      "SELECT COUNT(*) FROM callers WHERE agent_id = $1 AND caller_type = 'existing_client'",
      [COURTLAW_AGENT_ID]
    );
    const newLeads = await pool.query(
      "SELECT COUNT(*) FROM callers WHERE agent_id = $1 AND caller_type = 'new_lead'",
      [COURTLAW_AGENT_ID]
    );

    console.log('='.repeat(50));
    console.log('📊 FINAL COUNTS:');
    console.log(`   Existing Clients: ${existingClients.rows[0].count}`);
    console.log(`   New Leads: ${newLeads.rows[0].count}`);
    console.log('='.repeat(50));

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

fixAccuracy()
  .then(() => {
    console.log('\n✅ Accuracy fixes applied!');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Fix failed:', error);
    process.exit(1);
  });

// Clean up duplicate organizations and remaining data issues
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

const COURTLAW_AGENT_ID = 'agent_8e50b96f7e7bb7ce7479219fcc';

// Organization merges: [wrong name] -> [correct name]
const ORG_MERGES = [
  { from: 'Gyco', to: 'Geico' },
  { from: 'the the law', to: 'the law' },
  { from: 'Impressive', to: 'progressive' },
  { from: 'Boldberg Miller and Rubin', to: 'Goldberg, Miller, and Reuben' },
];

// Organizations to delete (bad/garbled names with 0 contacts)
const ORGS_TO_DELETE = [
  'Burlington ASC',
  'Diagnostic Emergency Center',
  'Dycho',
  'Esurance',
  'ExamWorks',
  'Hanover Insurance',
  'Millennium Medical Billing',
  'Surgical surgical center',
  'Total Care Fiscal Therapy Center',
  'Union County Surgery Center',
];

// Caller 181 - remove since no usable data (garbled transcript)
const CALLERS_TO_DELETE = [181];

async function cleanup() {
  console.log('\n🧹 Cleaning up duplicate organizations and bad data...\n');

  try {
    // Step 1: Merge duplicate organizations
    console.log('Step 1: Merging duplicate organizations...');

    for (const merge of ORG_MERGES) {
      // Find the source org
      const fromOrg = await pool.query(
        'SELECT id FROM organizations WHERE name = $1 AND agent_id = $2',
        [merge.from, COURTLAW_AGENT_ID]
      );

      if (fromOrg.rows.length === 0) {
        console.log(`   ⚠️ "${merge.from}" not found, skipping`);
        continue;
      }

      // Find the target org
      const toOrg = await pool.query(
        'SELECT id FROM organizations WHERE name = $1 AND agent_id = $2',
        [merge.to, COURTLAW_AGENT_ID]
      );

      if (toOrg.rows.length === 0) {
        // Just rename the org
        await pool.query(
          'UPDATE organizations SET name = $1 WHERE id = $2',
          [merge.to, fromOrg.rows[0].id]
        );
        console.log(`   📝 Renamed "${merge.from}" to "${merge.to}"`);
      } else {
        // Move contacts from source to target, then delete source
        await pool.query(
          'UPDATE organization_contacts SET organization_id = $1 WHERE organization_id = $2',
          [toOrg.rows[0].id, fromOrg.rows[0].id]
        );
        await pool.query('DELETE FROM organizations WHERE id = $1', [fromOrg.rows[0].id]);
        console.log(`   🔀 Merged "${merge.from}" into "${merge.to}"`);
      }
    }

    // Step 2: Delete empty/bad organizations
    console.log('\nStep 2: Deleting empty/bad organizations...');

    for (const orgName of ORGS_TO_DELETE) {
      const org = await pool.query(
        'SELECT id FROM organizations WHERE name = $1 AND agent_id = $2',
        [orgName, COURTLAW_AGENT_ID]
      );

      if (org.rows.length > 0) {
        // Check if it has contacts
        const contacts = await pool.query(
          'SELECT COUNT(*) FROM organization_contacts WHERE organization_id = $1',
          [org.rows[0].id]
        );

        if (parseInt(contacts.rows[0].count) === 0) {
          await pool.query('DELETE FROM organizations WHERE id = $1', [org.rows[0].id]);
          console.log(`   🗑️ Deleted empty org: "${orgName}"`);
        } else {
          console.log(`   ⚠️ "${orgName}" has contacts, keeping`);
        }
      }
    }

    // Step 3: Delete callers with no usable data
    console.log('\nStep 3: Removing callers with no usable data...');

    for (const callerId of CALLERS_TO_DELETE) {
      await pool.query('DELETE FROM caller_details WHERE caller_id = $1', [callerId]);
      await pool.query('DELETE FROM callers WHERE id = $1', [callerId]);
      console.log(`   🗑️ Deleted caller ${callerId} (no usable data)`);
    }

    // Step 4: Fix organization name casing/typos
    console.log('\nStep 4: Fixing organization name casing...');

    const nameFixes = [
      { from: 'progressive', to: 'Progressive' },
      { from: 'farmers', to: 'Farmers' },
      { from: 'the law', to: 'The Law Firm' },
      { from: 'all medical', to: 'All Medical' },
      { from: 'your medical', to: 'Your Medical' },
    ];

    for (const fix of nameFixes) {
      const result = await pool.query(
        'UPDATE organizations SET name = $1 WHERE name = $2 AND agent_id = $3',
        [fix.to, fix.from, COURTLAW_AGENT_ID]
      );
      if (result.rowCount > 0) {
        console.log(`   📝 "${fix.from}" → "${fix.to}"`);
      }
    }

    // Final counts
    console.log('\n' + '='.repeat(50));

    const orgs = await pool.query(
      'SELECT COUNT(*) FROM organizations WHERE agent_id = $1',
      [COURTLAW_AGENT_ID]
    );
    const contacts = await pool.query(`
      SELECT COUNT(*) FROM organization_contacts oc
      JOIN organizations o ON oc.organization_id = o.id
      WHERE o.agent_id = $1
    `, [COURTLAW_AGENT_ID]);
    const callers = await pool.query(
      'SELECT COUNT(*) FROM callers WHERE agent_id = $1',
      [COURTLAW_AGENT_ID]
    );
    const existingClients = await pool.query(
      "SELECT COUNT(*) FROM callers WHERE agent_id = $1 AND caller_type = 'existing_client'",
      [COURTLAW_AGENT_ID]
    );
    const newLeads = await pool.query(
      "SELECT COUNT(*) FROM callers WHERE agent_id = $1 AND caller_type = 'new_lead'",
      [COURTLAW_AGENT_ID]
    );

    console.log('📊 FINAL DATA COUNTS:');
    console.log(`   Organizations: ${orgs.rows[0].count}`);
    console.log(`   Org Contacts: ${contacts.rows[0].count}`);
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

cleanup()
  .then(() => {
    console.log('\n✅ Cleanup complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Cleanup failed:', error);
    process.exit(1);
  });

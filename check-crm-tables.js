// Check actual CRM tables
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkCRMTables() {
  try {
    // Organizations
    console.log('🏢 ORGANIZATIONS:');
    console.log('-'.repeat(100));
    const orgs = await pool.query(`
      SELECT * FROM organizations
      ORDER BY total_calls DESC
      LIMIT 20
    `);
    console.log('Columns:', Object.keys(orgs.rows[0] || {}).join(', '));
    console.log(`Total: ${orgs.rows.length} organizations shown\n`);
    for (const o of orgs.rows) {
      console.log(`${o.name} | Type: ${o.org_type} | Phone: ${o.primary_phone} | Calls: ${o.total_calls}`);
    }

    // Organization contacts
    console.log('\n\n👥 ORGANIZATION_CONTACTS:');
    console.log('-'.repeat(100));
    const contacts = await pool.query(`
      SELECT * FROM organization_contacts
      ORDER BY created_at DESC
      LIMIT 20
    `);
    console.log('Columns:', Object.keys(contacts.rows[0] || {}).join(', '));
    console.log(`Total: ${contacts.rows.length} contacts shown\n`);
    for (const c of contacts.rows) {
      console.log(`${c.name || 'N/A'} | Email: ${c.email || 'N/A'} | Org: ${c.organization_id} | Calls: ${c.call_count || 'N/A'}`);
    }

    // Leads (existing clients shown in CRM)
    console.log('\n\n📋 LEADS TABLE:');
    console.log('-'.repeat(100));
    const leads = await pool.query(`
      SELECT * FROM leads
      ORDER BY created_at DESC
      LIMIT 20
    `);
    console.log('Columns:', Object.keys(leads.rows[0] || {}).join(', '));
    console.log(`Total: ${leads.rows.length} leads shown\n`);
    for (const l of leads.rows) {
      console.log(`${l.name || 'N/A'} | Phone: ${l.phone || 'N/A'} | Claim: ${l.claim_number || 'N/A'} | Type: ${l.case_type || l.status || 'N/A'}`);
    }

    // Callers marked as existing_client
    console.log('\n\n👤 CALLERS (existing_client type):');
    console.log('-'.repeat(100));
    const existingClients = await pool.query(`
      SELECT c.*, cd.field_value as claim_number
      FROM callers c
      LEFT JOIN caller_details cd ON c.id = cd.caller_id AND cd.field_name = 'claim_number'
      WHERE c.caller_type = 'existing_client'
      ORDER BY c.last_call_date DESC
      LIMIT 20
    `);
    console.log(`Total: ${existingClients.rows.length} existing clients\n`);
    for (const c of existingClients.rows) {
      console.log(`ID: ${c.id} | Phone: ${c.phone_number} | Calls: ${c.total_calls} | Claim: ${c.claim_number || 'N/A'}`);
    }

    // Get caller details for a specific caller
    console.log('\n\n📋 CALLER_DETAILS (sample for first caller):');
    console.log('-'.repeat(100));
    if (existingClients.rows.length > 0) {
      const callerId = existingClients.rows[0].id;
      const details = await pool.query(`
        SELECT * FROM caller_details
        WHERE caller_id = $1
        ORDER BY recorded_at DESC
      `, [callerId]);
      console.log(`Details for caller ${callerId}:`);
      for (const d of details.rows) {
        console.log(`  ${d.field_name}: ${d.field_value} (confidence: ${d.confidence || 'N/A'})`);
      }
    }

    // Contact-client associations
    console.log('\n\n🔗 CONTACT_CLIENT_ASSOCIATIONS:');
    console.log('-'.repeat(100));
    try {
      const assocs = await pool.query(`
        SELECT * FROM contact_client_associations
        ORDER BY created_at DESC
        LIMIT 20
      `);
      console.log('Columns:', Object.keys(assocs.rows[0] || {}).join(', '));
      console.log(`Total: ${assocs.rows.length} associations\n`);
      for (const a of assocs.rows) {
        console.log(`Contact: ${a.contact_id} -> Client: ${a.client_name || a.caller_id} | Claim: ${a.claim_number || 'N/A'}`);
      }
    } catch (e) {
      console.log('Error:', e.message);
    }

    // Check organization_phone_numbers if it exists
    console.log('\n\n📞 ORGANIZATION_PHONE_NUMBERS:');
    console.log('-'.repeat(100));
    try {
      const phones = await pool.query(`
        SELECT opn.*, o.name as org_name
        FROM organization_phone_numbers opn
        JOIN organizations o ON opn.organization_id = o.id
        ORDER BY opn.created_at DESC
        LIMIT 20
      `);
      console.log(`Total: ${phones.rows.length} phone numbers\n`);
      for (const p of phones.rows) {
        console.log(`${p.org_name}: ${p.phone_number} (${p.label || 'main'})`);
      }
    } catch (e) {
      console.log('Table may not exist:', e.message);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkCRMTables();

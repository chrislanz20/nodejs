// Check current data in the caller CRM database
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkData() {
  try {
    // Check existing callers
    const callers = await pool.query(`
      SELECT c.id, c.phone_number, c.caller_type, c.preferred_language,
             cd.field_name, cd.field_value
      FROM callers c
      LEFT JOIN caller_details cd ON c.id = cd.caller_id
      WHERE c.agent_id = 'agent_8e50b96f7e7bb7ce7479219fcc'
      AND c.caller_type = 'existing_client'
      ORDER BY c.id, cd.field_name
    `);

    console.log('=== EXISTING CLIENTS IN DATABASE ===\n');

    // Group by caller
    const grouped = {};
    callers.rows.forEach(row => {
      if (!grouped[row.id]) {
        grouped[row.id] = {
          id: row.id,
          phone: row.phone_number,
          type: row.caller_type,
          language: row.preferred_language,
          fields: {}
        };
      }
      if (row.field_name) {
        grouped[row.id].fields[row.field_name] = row.field_value;
      }
    });

    Object.values(grouped).forEach(caller => {
      console.log(`ID: ${caller.id} | Phone: ${caller.phone} | Lang: ${caller.language}`);
      if (Object.keys(caller.fields).length > 0) {
        Object.entries(caller.fields).forEach(([k, v]) => {
          console.log(`   ${k}: ${v}`);
        });
      } else {
        console.log('   (no details)');
      }
      console.log('');
    });

    console.log(`\nTotal existing clients: ${Object.keys(grouped).length}`);

    // Check new leads
    const leads = await pool.query(`
      SELECT c.id, c.phone_number, c.caller_type, c.preferred_language,
             cd.field_name, cd.field_value
      FROM callers c
      LEFT JOIN caller_details cd ON c.id = cd.caller_id
      WHERE c.agent_id = 'agent_8e50b96f7e7bb7ce7479219fcc'
      AND c.caller_type = 'new_lead'
      ORDER BY c.id, cd.field_name
    `);

    console.log('\n=== NEW LEADS IN DATABASE ===\n');

    const groupedLeads = {};
    leads.rows.forEach(row => {
      if (!groupedLeads[row.id]) {
        groupedLeads[row.id] = {
          id: row.id,
          phone: row.phone_number,
          type: row.caller_type,
          language: row.preferred_language,
          fields: {}
        };
      }
      if (row.field_name) {
        groupedLeads[row.id].fields[row.field_name] = row.field_value;
      }
    });

    Object.values(groupedLeads).forEach(caller => {
      console.log(`ID: ${caller.id} | Phone: ${caller.phone} | Lang: ${caller.language}`);
      if (Object.keys(caller.fields).length > 0) {
        Object.entries(caller.fields).forEach(([k, v]) => {
          console.log(`   ${k}: ${v}`);
        });
      } else {
        console.log('   (no details)');
      }
      console.log('');
    });

    console.log(`\nTotal new leads: ${Object.keys(groupedLeads).length}`);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkData();

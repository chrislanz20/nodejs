// Check what tables exist in database
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkTables() {
  try {
    // List all tables
    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('📋 TABLES IN DATABASE:');
    console.log('-'.repeat(40));
    for (const row of tables.rows) {
      console.log(`  - ${row.table_name}`);
    }

    console.log('\n📊 Checking key tables...\n');

    // Check call_categories
    try {
      const cc = await pool.query('SELECT COUNT(*) as count FROM call_categories');
      console.log(`call_categories: ${cc.rows[0].count} rows`);

      // Show sample
      const sample = await pool.query('SELECT * FROM call_categories LIMIT 1');
      if (sample.rows.length > 0) {
        console.log('  Columns:', Object.keys(sample.rows[0]).join(', '));
      }
    } catch (e) {
      console.log('call_categories: NOT FOUND');
    }

    // Check callers
    try {
      const c = await pool.query('SELECT COUNT(*) as count FROM callers');
      console.log(`callers: ${c.rows[0].count} rows`);
    } catch (e) {
      console.log('callers: NOT FOUND');
    }

    // Check caller_details
    try {
      const cd = await pool.query('SELECT COUNT(*) as count FROM caller_details');
      console.log(`caller_details: ${cd.rows[0].count} rows`);
    } catch (e) {
      console.log('caller_details: NOT FOUND');
    }

    // Check organizations
    try {
      const o = await pool.query('SELECT COUNT(*) as count FROM organizations');
      console.log(`organizations: ${o.rows[0].count} rows`);
    } catch (e) {
      console.log('organizations: NOT FOUND');
    }

    // Check org_contacts
    try {
      const oc = await pool.query('SELECT COUNT(*) as count FROM org_contacts');
      console.log(`org_contacts: ${oc.rows[0].count} rows`);
    } catch (e) {
      console.log('org_contacts: NOT FOUND');
    }

    // Check client_associations
    try {
      const ca = await pool.query('SELECT COUNT(*) as count FROM client_associations');
      console.log(`client_associations: ${ca.rows[0].count} rows`);
    } catch (e) {
      console.log('client_associations: NOT FOUND');
    }

    // Check stored transcripts
    try {
      const t = await pool.query('SELECT COUNT(*) as count FROM transcripts');
      console.log(`transcripts: ${t.rows[0].count} rows`);
    } catch (e) {
      console.log('transcripts: NOT FOUND');
    }

    // Check calls table
    try {
      const calls = await pool.query('SELECT COUNT(*) as count FROM calls');
      console.log(`calls: ${calls.rows[0].count} rows`);
    } catch (e) {
      console.log('calls: NOT FOUND');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkTables();

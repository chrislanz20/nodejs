// Check contact_client_associations table structure and sample data
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

async function check() {
  try {
    // Get table structure
    const cols = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'contact_client_associations'
      ORDER BY ordinal_position
    `);
    console.log('TABLE STRUCTURE:');
    console.log('-'.repeat(60));
    for (const c of cols.rows) {
      console.log(`${c.column_name}: ${c.data_type} (default: ${c.column_default || 'none'})`);
    }

    // Get sample data
    console.log('\n\nSAMPLE DATA (all columns):');
    console.log('-'.repeat(60));
    const sample = await pool.query('SELECT * FROM contact_client_associations ORDER BY created_at DESC LIMIT 5');
    for (const row of sample.rows) {
      console.log(JSON.stringify(row, null, 2));
      console.log('---');
    }

    // Check for problematic claim numbers (spelled out)
    console.log('\n\nPROBLEMATIC CLAIM NUMBERS (contain "zero", "one", etc.):');
    console.log('-'.repeat(60));
    const problems = await pool.query(`
      SELECT id, client_name, claim_number
      FROM contact_client_associations
      WHERE claim_number IS NOT NULL
        AND (
          claim_number ILIKE '%zero%' OR
          claim_number ILIKE '%one%' OR
          claim_number ILIKE '%two%' OR
          claim_number ILIKE '%three%' OR
          claim_number ILIKE '%four%' OR
          claim_number ILIKE '%five%' OR
          claim_number ILIKE '%six%' OR
          claim_number ILIKE '%seven%' OR
          claim_number ILIKE '%eight%' OR
          claim_number ILIKE '%nine%'
        )
    `);
    console.log(`Found ${problems.rows.length} problematic records\n`);
    for (const p of problems.rows) {
      console.log(`ID ${p.id}: ${p.client_name} | Claim: ${p.claim_number}`);
    }

    // Check valid claim numbers
    console.log('\n\nVALID CLAIM NUMBERS (digits only):');
    console.log('-'.repeat(60));
    const valid = await pool.query(`
      SELECT id, client_name, claim_number
      FROM contact_client_associations
      WHERE claim_number IS NOT NULL
        AND claim_number !~ '(zero|one|two|three|four|five|six|seven|eight|nine)'
      LIMIT 10
    `);
    console.log(`Found ${valid.rows.length} valid records\n`);
    for (const v of valid.rows) {
      console.log(`ID ${v.id}: ${v.client_name} | Claim: ${v.claim_number}`);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

check();

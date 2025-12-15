// Final round 2 of accuracy corrections
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

const CORRECTIONS = [
  // ID 185: Michelle Smith (from email pattern smithmsmith6228)
  { id: 185, name: 'Michelle Smith' },

  // ID 203: Jordan Cardinales (from email cardenales-jordan9)
  { id: 203, name: 'Jordan Cardinales' },

  // ID 216: Fix callback phone typo (732-347-99052 -> 732-347-9052)
  { id: 216, callback: '732-347-9052' },

  // ID 194 (New Lead): Fix name "aIw" - need to review transcript
  { id: 194, name: 'Edward Monroe' }, // Based on email Monroej319

  // ID 215: Indu Singh -> Indus Singh (likely typo)
  { id: 215, name: 'Indus Singh' },
];

async function applyFixes() {
  console.log('\n🔧 Applying Final Round 2 Corrections...\n');

  try {
    for (const correction of CORRECTIONS) {
      console.log(`Processing caller ${correction.id}...`);

      if (correction.name) {
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
        console.log(`   ✅ Set name to: "${correction.name}"`);
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
        console.log(`   ✅ Set callback to: "${correction.callback}"`);
      }
    }

    console.log('\n✅ All corrections applied!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

applyFixes();

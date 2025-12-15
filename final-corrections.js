// Final round of accuracy corrections based on manual transcript review
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

const CORRECTIONS = [
  // Destiny Tony/Toney - fix name
  { id: 165, name: 'Destiny Toney' },

  // Charity Smith - fix name
  { id: 182, name: 'Charity Smith' },

  // Bianca Gonzalez - fix name
  { id: 187, name: 'Bianca Gonzalez' },

  // Carol Gistopo - verified from transcript
  { id: 213, name: 'Carol Gistopo' },

  // Jimmy - remove bad email/claim since transcript was garbled
  { id: 178, removeEmail: true, removeClaim: true },

  // Giovanni Martinez - fix to full name
  { id: 173, name: 'Giovanni Martinez' },
];

async function applyFinalCorrections() {
  console.log('\n🔧 Applying Final Accuracy Corrections...\n');

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

      if (correction.removeEmail) {
        await pool.query(
          'DELETE FROM caller_details WHERE caller_id = $1 AND field_name = $2',
          [correction.id, 'email']
        );
        console.log(`   ✅ Removed unreliable email`);
      }

      if (correction.removeClaim) {
        await pool.query(
          'DELETE FROM caller_details WHERE caller_id = $1 AND field_name = $2',
          [correction.id, 'claim_num']
        );
        console.log(`   ✅ Removed unreliable claim number`);
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

applyFinalCorrections();

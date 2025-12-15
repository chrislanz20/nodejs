// Fix claim numbers that are stored as spelled-out words
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

// Convert spelled-out numbers to digits
function convertSpokenToDigits(text) {
  if (!text) return text;

  const wordMap = {
    'zero': '0', 'oh': '0', 'o': '0',
    'one': '1',
    'two': '2',
    'three': '3',
    'four': '4',
    'five': '5',
    'six': '6',
    'seven': '7',
    'eight': '8',
    'nine': '9'
  };

  let result = text;

  // Replace word numbers with digits
  for (const [word, digit] of Object.entries(wordMap)) {
    // Match word boundaries to avoid partial replacements
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    result = result.replace(regex, digit);
  }

  // Clean up extra spaces and dashes
  result = result
    .replace(/\s+-\s+/g, '-')  // " - " -> "-"
    .replace(/\s+/g, '')       // Remove spaces between digits
    .replace(/-+/g, '-')       // Multiple dashes -> single dash
    .replace(/^-|-$/g, '');    // Remove leading/trailing dashes

  return result;
}

async function fixClaimNumbers() {
  console.log('🔧 FIXING CLAIM NUMBERS');
  console.log('='.repeat(60));

  try {
    // Find problematic records
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

    console.log(`Found ${problems.rows.length} records to fix\n`);

    for (const row of problems.rows) {
      const original = row.claim_number;
      const fixed = convertSpokenToDigits(original);

      console.log(`ID ${row.id}: ${row.client_name}`);
      console.log(`  Before: ${original}`);
      console.log(`  After:  ${fixed}`);

      // Update the record
      await pool.query(`
        UPDATE contact_client_associations
        SET claim_number = $1, updated_at = NOW()
        WHERE id = $2
      `, [fixed, row.id]);

      console.log(`  ✅ Updated\n`);
    }

    console.log('='.repeat(60));
    console.log('✅ All claim numbers fixed');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

fixClaimNumbers();

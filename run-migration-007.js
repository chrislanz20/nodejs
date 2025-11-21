// Run migration 007: Add case-specific data columns
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING,
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  try {
    console.log('📦 Running migration 007: Add case-specific data columns...\n');

    const sql = fs.readFileSync(path.join(__dirname, 'migrations', '007_add_case_specific_data.sql'), 'utf8');

    await pool.query(sql);

    console.log('✅ Migration 007 completed successfully!');
    console.log('\nAdded columns:');
    console.log('  - case_specific_data (JSONB) - stores flexible case-type fields');
    console.log('  - case_type (TEXT) - for filtering by case type');
    console.log('  - GIN index on case_specific_data for fast queries\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

runMigration();

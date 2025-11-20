require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10
});

async function runMigration() {
  try {
    const migrationPath = path.join(__dirname, 'migrations', '005_add_last_login.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('Running migration: 005_add_last_login.sql');
    await pool.query(sql);
    console.log('✅ Migration completed successfully!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();

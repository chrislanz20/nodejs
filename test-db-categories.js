require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL_NON_POOLING,
  ssl: { rejectUnauthorized: false }
});

async function test() {
  try {
    console.log('Testing database connection...');

    // Check if table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'call_categories'
      );
    `);
    console.log('Table exists:', tableCheck.rows[0].exists);

    // Count rows
    const count = await pool.query('SELECT COUNT(*) FROM call_categories');
    console.log('Total rows:', count.rows[0].count);

    // Sample data
    const sample = await pool.query('SELECT * FROM call_categories LIMIT 3');
    console.log('Sample rows:', sample.rows);

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

test();

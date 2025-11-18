require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL_NON_POOLING,
  ssl: { rejectUnauthorized: false }
});

async function checkCategories() {
  try {
    const result = await pool.query('SELECT COUNT(*) as total FROM call_categories');
    console.log('Total categories in database:', result.rows[0].total);

    const sample = await pool.query('SELECT call_id, category FROM call_categories LIMIT 5');
    console.log('\nSample categories:');
    console.log(sample.rows);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkCategories();

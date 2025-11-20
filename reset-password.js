require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10
});

async function resetPassword() {
  try {
    const hash = await bcrypt.hash('password123', 10);
    await pool.query(
      'UPDATE clients SET password_hash = $1 WHERE email = $2',
      [hash, 'test@example.com']
    );
    console.log('✅ Password updated for test@example.com');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

resetPassword();

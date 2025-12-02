// Script to manually add Andrea to leads table
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || 'postgresql://saveyatech_admin:ysqBzpOea6gh0Lze@dpg-d06hp4juibrs73c3vhhg-a.virginia-postgres.render.com/saveyatech_db',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 10000
});

async function addAndrea() {
  try {
    console.log('Connecting to database...');
    
    // Check if lead already exists
    const existing = await pool.query(
      `SELECT * FROM leads WHERE phone_number LIKE '%6094500409%'`
    );
    
    if (existing.rows.length > 0) {
      console.log('Lead already exists:', existing.rows[0]);
      return;
    }
    
    console.log('No existing lead found. Adding Andrea...');
    
    // Insert Andrea's lead
    const result = await pool.query(
      `INSERT INTO leads (
        call_id, agent_id, phone_number, name, email,
        incident_description, incident_date, incident_location,
        category, status, case_type, referral_source
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        'call_3a13f203dc5f35c39f05d390409',
        'agent_5aa697d50952f8834c76e6737e', // NEW agent ID
        '+16094500409',
        'Marjan Reed',
        'margianreidfashion@gmail.com',
        'Two separate car accidents: one in May 2022 and another in September 2024. Sustained injuries to upper shoulder, middle section, and lower back in both incidents. Other drivers were at fault in both cases.',
        '2022-05-21', // May 2022 (first incident, as shown in dashboard)
        'New Jersey',
        'New Lead',
        'Pending',
        'car_accident',
        null
      ]
    );
    
    console.log('✅ Lead added successfully:', result.rows[0]);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

addAndrea();

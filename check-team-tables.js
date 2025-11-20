// Check if team_members and activity_log tables exist
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL_NON_POOLING
});

async function checkTables() {
  try {
    // Check for team_members table
    const teamMembersCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'team_members'
      );
    `);

    // Check for activity_log table
    const activityLogCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'activity_log'
      );
    `);

    console.log('\n📊 Database Table Check:\n');
    console.log(`team_members table exists: ${teamMembersCheck.rows[0].exists ? '✅ YES' : '❌ NO'}`);
    console.log(`activity_log table exists: ${activityLogCheck.rows[0].exists ? '✅ YES' : '❌ NO'}`);

    // If team_members exists, check its structure
    if (teamMembersCheck.rows[0].exists) {
      const columns = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'team_members'
        ORDER BY ordinal_position;
      `);

      console.log('\n📋 team_members table structure:');
      columns.rows.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type})${col.is_nullable === 'NO' ? ' NOT NULL' : ''}`);
      });

      // Check count
      const count = await pool.query('SELECT COUNT(*) FROM team_members');
      console.log(`\n👥 Total team members: ${count.rows[0].count}`);
    }

    // If activity_log exists, check its structure
    if (activityLogCheck.rows[0].exists) {
      const columns = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'activity_log'
        ORDER BY ordinal_position;
      `);

      console.log('\n📋 activity_log table structure:');
      columns.rows.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type})${col.is_nullable === 'NO' ? ' NOT NULL' : ''}`);
      });

      // Check count
      const count = await pool.query('SELECT COUNT(*) FROM activity_log');
      console.log(`\n📝 Total activity log entries: ${count.rows[0].count}`);
    }

    console.log('\n');

  } catch (error) {
    console.error('❌ Error checking tables:', error);
  } finally {
    await pool.end();
  }
}

checkTables();

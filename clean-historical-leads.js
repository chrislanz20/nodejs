// Clean up historical leads - keep only leads from today
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL_NON_POOLING
});

async function cleanHistoricalLeads() {
  console.log('\n🧹 Cleaning Historical Leads from Lead Tracker...\n');

  try {
    // Get today's date at midnight (start of day)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD format

    console.log(`📅 Today's date: ${todayStr}\n`);

    // First, let's see all leads
    const allLeads = await pool.query(`
      SELECT id, name, phone_number, first_call_date, category, status
      FROM leads
      ORDER BY first_call_date DESC
    `);

    console.log(`📊 Total leads in database: ${allLeads.rows.length}\n`);

    // Identify leads from today
    const leadsFromToday = allLeads.rows.filter(lead => {
      const leadDate = new Date(lead.first_call_date);
      leadDate.setHours(0, 0, 0, 0);
      return leadDate.toISOString().split('T')[0] === todayStr;
    });

    console.log(`✅ Leads from TODAY (${todayStr}):`);
    if (leadsFromToday.length === 0) {
      console.log('   None found');
    } else {
      leadsFromToday.forEach(lead => {
        console.log(`   - ID ${lead.id}: ${lead.name || lead.phone_number} (${lead.category}, ${lead.status})`);
      });
    }

    // Identify historical leads to delete
    const historicalLeads = allLeads.rows.filter(lead => {
      const leadDate = new Date(lead.first_call_date);
      leadDate.setHours(0, 0, 0, 0);
      return leadDate.toISOString().split('T')[0] !== todayStr;
    });

    console.log(`\n❌ Historical leads to DELETE (not from today):`);
    if (historicalLeads.length === 0) {
      console.log('   None found');
    } else {
      historicalLeads.forEach(lead => {
        const date = new Date(lead.first_call_date).toISOString().split('T')[0];
        console.log(`   - ID ${lead.id}: ${lead.name || lead.phone_number} (${date})`);
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log(`Summary:`);
    console.log(`  Keep:   ${leadsFromToday.length} leads from today`);
    console.log(`  Delete: ${historicalLeads.length} historical leads`);
    console.log('='.repeat(60));

    if (historicalLeads.length > 0) {
      console.log('\n⚠️  Deleting historical leads...\n');

      const historicalIds = historicalLeads.map(l => l.id);
      const result = await pool.query(
        `DELETE FROM leads WHERE id = ANY($1::int[]) RETURNING id`,
        [historicalIds]
      );

      console.log(`✅ Deleted ${result.rowCount} historical leads`);
    }

    // Verify final state
    const finalCount = await pool.query('SELECT COUNT(*) FROM leads');
    console.log(`\n✅ Final lead count: ${finalCount.rows[0].count}`);
    console.log('\n🎉 Cleanup complete! Lead Tracker now only shows today\'s new leads.\n');

  } catch (error) {
    console.error('\n❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

cleanHistoricalLeads()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Failed:', error);
    process.exit(1);
  });

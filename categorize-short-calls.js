require('dotenv').config();
const { Pool } = require('pg');
const axios = require('axios');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10
});

async function categorizeShortCalls() {
  try {
    // Get all categorized call IDs from database
    const categorized = await pool.query('SELECT call_id FROM call_categories');
    const categorizedIds = new Set(categorized.rows.map(r => r.call_id));
    console.log(`✅ ${categorizedIds.size} calls already categorized`);

    // Fetch calls from Retell API
    console.log('\n📡 Fetching calls from Retell API...');
    const response = await axios.post('https://api.retellai.com/v2/list-calls', {
      limit: 1000,
      sort_order: 'descending'
    }, {
      headers: { 'Authorization': `Bearer ${process.env.RETELL_API_KEY}` }
    });

    const allCalls = response.data;
    console.log(`✅ ${allCalls.length} total calls from Retell API`);

    // Find uncategorized calls under 1 minute
    const shortUncategorizedCalls = allCalls.filter(call => {
      if (categorizedIds.has(call.call_id)) return false;

      const duration_minutes = call.end_timestamp && call.start_timestamp
        ? Math.round((call.end_timestamp - call.start_timestamp) / 1000 / 60 * 100) / 100
        : 0;

      return duration_minutes < 1;
    });

    console.log(`\n🔄 Found ${shortUncategorizedCalls.length} uncategorized short calls to process`);

    if (shortUncategorizedCalls.length === 0) {
      console.log('✅ No short calls to categorize!');
      await pool.end();
      process.exit(0);
    }

    // Create categories object
    const categories = {};
    shortUncategorizedCalls.forEach(call => {
      categories[call.call_id] = {
        category: 'Other',
        reasoning: 'Call duration under 1 minute',
        manual: false,
        auto: true
      };
    });

    // Save to database via API
    console.log(`\n💾 Saving ${Object.keys(categories).length} categories to database...`);
    const saveResponse = await axios.post('http://localhost:3000/api/save-categories', {
      categories
    });

    console.log(`✅ SUCCESS! Saved ${saveResponse.data.saved} short call categories`);

    // Verify
    const finalCount = await pool.query('SELECT COUNT(*) FROM call_categories');
    console.log(`\n📊 Total categorized calls now: ${finalCount.rows[0].count}`);

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('API Response:', error.response.data);
    }
    process.exit(1);
  }
}

categorizeShortCalls();

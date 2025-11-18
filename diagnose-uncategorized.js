require('dotenv').config();
const { Pool } = require('pg');
const axios = require('axios');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING,
  ssl: { rejectUnauthorized: false }
});

async function diagnose() {
  try {
    // Get all categorized call IDs from database
    const categorized = await pool.query('SELECT call_id FROM call_categories');
    const categorizedIds = new Set(categorized.rows.map(r => r.call_id));
    console.log(`✅ ${categorizedIds.size} calls categorized in database`);

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

    // Find uncategorized calls
    const uncategorizedCalls = allCalls.filter(call => !categorizedIds.has(call.call_id));
    console.log(`\n❌ ${uncategorizedCalls.length} uncategorized calls found`);

    if (uncategorizedCalls.length > 0) {
      console.log('\n📊 Analyzing uncategorized calls:');

      // Calculate duration for each
      const withDuration = uncategorizedCalls.map(call => ({
        call_id: call.call_id,
        start_timestamp: call.start_timestamp,
        end_timestamp: call.end_timestamp,
        duration_minutes: call.end_timestamp && call.start_timestamp
          ? Math.round((call.end_timestamp - call.start_timestamp) / 1000 / 60 * 100) / 100
          : 0,
        has_transcript: !!call.transcript || !!call.transcript_object
      }));

      // Group by reasons
      const under1Min = withDuration.filter(c => c.duration_minutes < 1);
      const over1MinNoTranscript = withDuration.filter(c => c.duration_minutes >= 1 && !c.has_transcript);
      const over1MinWithTranscript = withDuration.filter(c => c.duration_minutes >= 1 && c.has_transcript);
      const noTimestamps = withDuration.filter(c => !c.end_timestamp || !c.start_timestamp);

      console.log(`\n📉 Under 1 minute: ${under1Min.length}`);
      if (under1Min.length > 0) {
        console.log('   (These should auto-categorize as "Other")');
        console.log('   Sample:', under1Min.slice(0, 3).map(c => `${c.call_id.substring(0, 15)}... (${c.duration_minutes} min)`));
      }

      console.log(`\n⏱️  Missing timestamps: ${noTimestamps.length}`);
      if (noTimestamps.length > 0) {
        console.log('   Sample:', noTimestamps.slice(0, 3).map(c => c.call_id.substring(0, 20) + '...'));
      }

      console.log(`\n📝 1+ min WITHOUT transcript: ${over1MinNoTranscript.length}`);
      if (over1MinNoTranscript.length > 0) {
        console.log('   (Cannot categorize without transcript)');
        console.log('   Sample:', over1MinNoTranscript.slice(0, 3).map(c => `${c.call_id.substring(0, 15)}... (${c.duration_minutes} min)`));
      }

      console.log(`\n✍️  1+ min WITH transcript: ${over1MinWithTranscript.length}`);
      if (over1MinWithTranscript.length > 0) {
        console.log('   (These SHOULD have been categorized by AI!)');
        console.log('   Sample:', over1MinWithTranscript.slice(0, 5).map(c => `${c.call_id.substring(0, 15)}... (${c.duration_minutes} min)`));
      }

      // Check if any recent calls (last 24 hours)
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      const recentUncategorized = withDuration.filter(c => c.start_timestamp > oneDayAgo);
      console.log(`\n🕐 Recent (last 24hrs): ${recentUncategorized.length}`);
    }

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

diagnose();

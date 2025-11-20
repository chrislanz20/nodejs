// Find today's New Lead calls and add them to Lead Tracker
require('dotenv').config();
const { Pool } = require('pg');
const { Retell } = require('retell-sdk');
const { trackLead } = require('./lib/leadTracking');
const { extractLeadDataFromTranscript } = require('./lib/extractLeadData');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL_NON_POOLING
});

const retellClient = new Retell({
  apiKey: process.env.RETELL_API_KEY
});

const COURTLAW_AGENT_ID = 'agent_8e50b96f7e7bb7ce7479219fcc';

async function addTodaysLeads() {
  console.log('\n🔍 Finding Today\'s New Lead Calls...\n');

  try {
    // Get today's date boundaries (Nov 19, 2024)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStart = tomorrow.getTime();

    console.log(`📅 Looking for calls on: ${today.toLocaleDateString()}`);
    console.log(`⏰ Time range: ${todayStart} - ${tomorrowStart}\n`);

    // Get all call categories from database
    const categoriesResult = await pool.query(
      'SELECT call_id, category FROM call_categories'
    );

    const categoriesMap = {};
    categoriesResult.rows.forEach(row => {
      categoriesMap[row.call_id] = row.category;
    });

    // Fetch calls from Retell API
    console.log('📥 Fetching calls from Retell API...\n');
    const response = await retellClient.call.list({ limit: 100 });
    const calls = Array.isArray(response) ? response : (response.calls || []);

    // Filter for CourtLaw calls from today
    const todaysCalls = calls.filter(call =>
      call.agent_id === COURTLAW_AGENT_ID &&
      call.start_timestamp >= todayStart &&
      call.start_timestamp < tomorrowStart
    );

    console.log(`📊 Found ${todaysCalls.length} CourtLaw calls from today\n`);

    // Filter for New Lead calls
    const newLeadCalls = todaysCalls.filter(call =>
      categoriesMap[call.call_id] === 'New Lead'
    );

    console.log(`✅ New Lead calls from today: ${newLeadCalls.length}\n`);

    if (newLeadCalls.length === 0) {
      console.log('No New Lead calls found from today. Exiting.\n');
      return;
    }

    // Process each New Lead call
    let added = 0;
    for (const call of newLeadCalls) {
      console.log(`\n🔄 Processing: ${call.call_id}`);
      console.log(`   Phone: ${call.from_number}`);

      // Extract data from transcript if available
      let extractedData = null;
      if (call.transcript) {
        console.log('   📝 Extracting data from transcript...');
        extractedData = await extractLeadDataFromTranscript(call.transcript);
      }

      // Build call data
      const callData = {
        phone: call.from_number,
        phone_number: call.from_number,
        from_number: call.from_number,
        name: extractedData?.name || null,
        email: extractedData?.email || null,
        incident_description: extractedData?.incident_description || call.call_analysis?.call_summary || null,
        incident_date: extractedData?.incident_date || null,
        incident_location: extractedData?.incident_location || null
      };

      console.log(`   Name: ${callData.name || 'Not extracted'}`);
      console.log(`   Email: ${callData.email || 'Not extracted'}`);

      // Add to Lead Tracker
      const result = await trackLead(call.call_id, COURTLAW_AGENT_ID, 'New Lead', callData);

      if (result && result.isNewLead) {
        added++;
        console.log(`   ✅ Added to Lead Tracker as Pending`);
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`New Leads from today: ${newLeadCalls.length}`);
    console.log(`Added to tracker:     ${added}`);
    console.log('='.repeat(60) + '\n');

    console.log('✅ Done! Check the Lead Tracker in your dashboard.\n');

  } catch (error) {
    console.error('\n❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

addTodaysLeads()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Failed:', error);
    process.exit(1);
  });

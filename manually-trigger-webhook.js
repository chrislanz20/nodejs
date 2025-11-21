// Manually trigger webhook for most recent call to test if it works
const Retell = require('retell-sdk');
require('dotenv').config();
const axios = require('axios');

const client = new Retell({
  apiKey: process.env.RETELL_API_KEY,
});

async function triggerWebhook() {
  console.log('🧪 MANUALLY TRIGGERING WEBHOOK FOR MOST RECENT CALL\n');

  // Get most recent call
  const calls = await client.call.list({ limit: 1 });
  const call = calls[0];
  const callId = call.callId || call.call_id;

  console.log(`Testing with call: ${callId}`);
  console.log(`Time: ${new Date(call.startTimestamp || call.start_timestamp).toLocaleString()}\n`);

  // Send to production webhook
  const webhookUrl = 'https://nodejs-theta-woad.vercel.app/webhook/retell-call-ended';

  console.log(`Sending POST to: ${webhookUrl}\n`);

  try {
    const response = await axios.post(
      webhookUrl,
      { call: call, call_id: callId, agent_id: call.agentId || call.agent_id },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000,
        validateStatus: () => true // Accept any status
      }
    );

    console.log(`✅ Webhook responded with status: ${response.status}`);

    if (response.data) {
      console.log('Response:', response.data);
    }

    // Wait a few seconds then check if it's in database
    console.log('\nWaiting 5 seconds for processing...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));

    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.POSTGRES_URL_NON_POOLING,
      ssl: { rejectUnauthorized: false }
    });

    const result = await pool.query('SELECT call_id, category FROM call_categories WHERE call_id = $1', [callId]);

    if (result.rows.length > 0) {
      console.log(`✅ SUCCESS! Call is now in database`);
      console.log(`   Category: ${result.rows[0].category}`);
    } else {
      console.log(`❌ FAILED - Call is NOT in database`);
      console.log(`   This means categorization failed or didn't run`);
    }

    pool.end();

  } catch (error) {
    console.error(`❌ Webhook request failed:`, error.message);
  }
}

triggerWebhook();

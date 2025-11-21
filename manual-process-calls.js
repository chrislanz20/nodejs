// Manually process the 3 missing calls
const Retell = require('retell-sdk');
require('dotenv').config();
const axios = require('axios');

const client = new Retell({
  apiKey: process.env.RETELL_API_KEY,
});

const missingCalls = [
  'call_3c99b870699ef23ee02094cad6e',
  'call_528836ecdb3295af9aa08745de5',
  'call_e2b3700801d9fa21efd72aafb33'
];

async function processCall(callId) {
  console.log(`\n📞 Processing ${callId}...`);

  try {
    // Get full call data from Retell
    const call = await client.call.retrieve(callId);

    console.log(`  Duration: ${(call.end_timestamp - call.start_timestamp) / 1000}s`);
    console.log(`  Agent: ${call.agent_id}`);

    // Send to our webhook endpoint
    const webhookData = {
      call: call,
      call_id: call.call_id,
      agent_id: call.agent_id
    };

    const response = await axios.post(
      'https://nodejs-theta-woad.vercel.app/webhook/retell-call-ended',
      webhookData,
      { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );

    console.log(`  ✅ Processed successfully`);
    console.log(`  Category: ${response.data.category || 'Unknown'}`);

  } catch (error) {
    console.error(`  ❌ Error: ${error.response?.data?.error || error.message}`);
  }
}

async function main() {
  console.log('🔧 Manually processing missing calls...\n');

  for (const callId of missingCalls) {
    await processCall(callId);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s between calls
  }

  console.log('\n✅ Done processing calls!');
}

main();

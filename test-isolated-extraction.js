// Isolated test of the exact transcript that's failing
require('dotenv').config();
const Retell = require('retell-sdk').default;
const retellClient = new Retell({ apiKey: process.env.RETELL_API_KEY });

// Import the extraction function from lib
const path = require('path');

// Clear require cache to ensure we get the latest version
delete require.cache[require.resolve('./lib/extractAllCallData')];
const { extractAllCallData } = require('./lib/extractAllCallData');

async function test() {
  const call = await retellClient.call.retrieve('call_59ca960bade7e57071a1d25bd9d');

  console.log('Transcript messages around claim section:');
  for (let i = 8; i <= 16; i++) {
    const msg = call.transcript_object[i];
    console.log(`[${i}] ${msg.role}: "${msg.content}"`);
  }

  console.log('\n--- Running extractAllCallData ---\n');

  const result = await extractAllCallData(call.transcript_object, 'Test');

  console.log('\n--- Result ---');
  console.log('claim_number:', result?.claim_number);
  console.log('Expected: 41089621');
}

test().catch(console.error);

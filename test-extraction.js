// Test transcript extraction
require('dotenv').config();
const { Retell } = require('retell-sdk');
const { extractLeadDataFromTranscript } = require('./lib/extractLeadData');

const retellClient = new Retell({ apiKey: process.env.RETELL_API_KEY });

async function test() {
  try {
    console.log('\n🧪 Testing Lead Data Extraction from Transcript\n');

    // Get a call with a transcript
    const callId = 'call_69f9779d9f413a80ad81feb77c4';
    const call = await retellClient.call.retrieve(callId);

    console.log(`📞 Testing with call: ${callId}`);
    console.log(`Caller: ${call.from_number}\n`);

    // Extract data from transcript
    console.log('🤖 Extracting data with AI...\n');
    const extracted = await extractLeadDataFromTranscript(call.transcript);

    console.log('📊 Extracted Data:');
    console.log(JSON.stringify(extracted, null, 2));
    console.log('\n✅ Test complete!\n');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

test();

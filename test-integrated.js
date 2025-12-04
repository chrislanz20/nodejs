// Test the integrated extractAllCallData with the new claim number extraction

require('dotenv').config();
const Retell = require('retell-sdk').default;
const { extractAllCallData } = require('./lib/extractAllCallData');

const retellClient = new Retell({ apiKey: process.env.RETELL_API_KEY });

async function testIntegrated() {
  const testCalls = [
    { id: 'call_938d164eb068ed689968de5cd8d', expected: '8796596610000001', desc: '"ends with a 1" case' },
    { id: 'call_25d97a29eb7e2fc9ff12dbbda5f', expected: '283997515', desc: 'dash-separated' },
    { id: 'call_4e4f73804cc1e823ee3bb359d33', expected: '067775711500000003', desc: 'agent transcription error' },
    { id: 'call_bfc2c287f3e2b54d0deaaee852e', expected: 'LA3590525821300005', desc: '"L as in Larry" format' },
  ];

  let correct = 0;

  for (const { id: callId, expected, desc } of testCalls) {
    console.log('\n' + '='.repeat(70));
    console.log(`CALL: ${callId}`);
    console.log(`TYPE: ${desc}`);
    console.log(`EXPECTED: ${expected}`);

    try {
      const call = await retellClient.call.retrieve(callId);
      const transcript = call.transcript_object;

      // Use the actual extractAllCallData function
      const extracted = await extractAllCallData(transcript, 'Insurance');

      console.log(`\nEXTRACTED CLAIM NUMBER: ${extracted?.claim_number}`);

      if (extracted?.claim_number === expected) {
        console.log(`✅ CORRECT`);
        correct++;
      } else {
        console.log(`❌ WRONG - expected ${expected}`);
      }
    } catch (err) {
      console.log(`❌ ERROR: ${err.message}`);
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`RESULTS: ${correct}/${testCalls.length} correct (${((correct / testCalls.length) * 100).toFixed(1)}%)`);
}

testIntegrated().catch(console.error);

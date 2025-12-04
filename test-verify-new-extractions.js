// Verify specific problem calls and test the fix
require('dotenv').config();
const Retell = require('retell-sdk').default;
const { extractAllCallData } = require('./lib/extractAllCallData');
const retellClient = new Retell({ apiKey: process.env.RETELL_API_KEY });

// These are calls where we need to verify accuracy
const testCases = [
  { callId: 'call_c1ad025d3a6d5ae4c2080ad24fa', expected: '1548809221', note: 'User said "one five four eight eight zero nine two two one"' },
  { callId: 'call_59ca960bade7e57071a1d25bd9d', expected: '41089621', note: 'User said "four one zero eight nine six two dash one"' },
];

async function verify() {
  console.log('Testing claim extraction accuracy on problem calls...\n');

  for (const testCase of testCases) {
    const call = await retellClient.call.retrieve(testCase.callId);

    console.log('\n' + '='.repeat(80));
    console.log(`CALL: ${testCase.callId}`);
    console.log(`EXPECTED: ${testCase.expected}`);
    console.log(`NOTE: ${testCase.note}`);
    console.log('='.repeat(80));

    // Run extraction
    const result = await extractAllCallData(call.transcript_object, 'Test');
    const extracted = result?.claim_number;

    console.log(`\nEXTRACTED: ${extracted}`);

    if (extracted === testCase.expected) {
      console.log('✅ PASS - Extraction matches expected');
    } else {
      console.log(`❌ FAIL - Expected ${testCase.expected}, got ${extracted}`);
    }
  }
}

verify().catch(console.error);

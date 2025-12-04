// Debug test to understand extraction issues
// Focus on the specific problem cases

require('dotenv').config();
const Retell = require('retell-sdk').default;

const retellClient = new Retell({ apiKey: process.env.RETELL_API_KEY });

// Import the actual extraction function to test it
const { extractAllCallData } = require('./lib/extractAllCallData');

async function debugExtraction() {
  console.log('='.repeat(100));
  console.log('DEBUG: Testing claim number extraction on specific problem cases');
  console.log('='.repeat(100));

  const problemCases = [
    {
      callId: 'call_4e4f73804cc1e823ee3bb359d33',
      issue: 'Wrong zero count - extracted 067775711500000003 but should be 06777571150000003',
      expectedClaimNumber: '06777571150000003'
    },
    {
      callId: 'call_1cb6123a3e1071e99a20ce75bfe',
      issue: 'User initially said NO but later provided claim number - should extract it',
      expectedClaimNumber: '3214600001'
    },
    {
      callId: 'call_f7b4ddbfe33a35460271b5f45cb',
      issue: 'Missed extraction - has letters H in claim number',
      expectedClaimNumber: '3050H398H'
    },
    {
      callId: 'call_bfbf048e4c6a6a91ed3ccc105be',
      issue: 'Missed extraction - agent provided claim number, user confirmed',
      expectedClaimNumber: '126229331'
    },
    {
      callId: 'call_9bb688e31abcf47c243224b11b6',
      issue: 'Missed extraction - agent provided claim number, user confirmed',
      expectedClaimNumber: '126229331'
    }
  ];

  for (const testCase of problemCases) {
    console.log('\n' + '─'.repeat(100));
    console.log(`📞 CALL: ${testCase.callId}`);
    console.log(`⚠️  ISSUE: ${testCase.issue}`);
    console.log(`✅ EXPECTED: ${testCase.expectedClaimNumber}`);
    console.log('─'.repeat(100));

    try {
      const call = await retellClient.call.retrieve(testCase.callId);

      if (!call.transcript_object) {
        console.log('❌ No transcript found');
        continue;
      }

      // Show the relevant transcript portion
      console.log('\n📜 TRANSCRIPT (claim section):');
      let inSection = false;
      for (let i = 0; i < call.transcript_object.length; i++) {
        const msg = call.transcript_object[i];
        const c = msg.content.toLowerCase();

        if (c.includes('claim') || c.includes('policy') || c.includes('file number')) {
          inSection = true;
        }

        if (inSection) {
          console.log(`   [${i}] ${msg.role.toUpperCase()}: ${msg.content}`);

          if (msg.role === 'agent' && (
            c.includes('what specifically') ||
            c.includes('how can i help') ||
            c.includes('is there anything else') ||
            c.includes('i have all your information')
          )) {
            break;
          }
        }
      }

      // Run the actual extraction
      console.log('\n🔬 RUNNING EXTRACTION...');
      const result = await extractAllCallData(call.transcript_object, 'Test');

      console.log(`\n📊 EXTRACTION RESULT:`);
      console.log(`   Claim Number: ${result?.claim_number || 'null'}`);

      if (testCase.expectedClaimNumber === null) {
        if (result?.claim_number === null || result?.claim_number === undefined) {
          console.log(`   ✅ PASS - Correctly returned null`);
        } else {
          console.log(`   ❌ FAIL - Should be null but got: ${result?.claim_number}`);
        }
      } else {
        if (result?.claim_number === testCase.expectedClaimNumber) {
          console.log(`   ✅ PASS - Matches expected`);
        } else {
          console.log(`   ❌ FAIL - Expected: ${testCase.expectedClaimNumber}, Got: ${result?.claim_number}`);
        }
      }

    } catch (err) {
      console.log(`❌ Error: ${err.message}`);
    }
  }

  console.log('\n' + '='.repeat(100));
  console.log('DEBUG COMPLETE');
  console.log('='.repeat(100));
}

debugExtraction().catch(console.error);

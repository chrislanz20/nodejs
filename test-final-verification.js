// Final verification test - uses the actual extractAllCallData function
// This is what the production system uses

require('dotenv').config();
const Retell = require('retell-sdk').default;
const { extractAllCallData } = require('./lib/extractAllCallData');

const retellClient = new Retell({ apiKey: process.env.RETELL_API_KEY });

async function finalVerification() {
  console.log('='.repeat(100));
  console.log('FINAL VERIFICATION: Testing PRODUCTION extraction on all calls with claim numbers');
  console.log('='.repeat(100));

  const calls = await retellClient.call.list({ limit: 100 });
  const callsWithTranscripts = calls.filter(c => c.transcript_object && c.transcript_object.length > 0);

  // Find calls that mention claim numbers
  const hasClaimMention = (t) => {
    const text = t.map(m => m.content.toLowerCase()).join(' ');
    return text.includes('claim number') || text.includes('policy number') || text.includes('file number');
  };

  const claimCalls = callsWithTranscripts.filter(c => hasClaimMention(c.transcript_object));

  console.log(`\nFound ${claimCalls.length} calls mentioning claim numbers\n`);

  let extracted = 0;
  let notExtracted = 0;
  const results = [];

  for (const call of claimCalls) {
    console.log(`\n📞 ${call.call_id}`);

    const result = await extractAllCallData(call.transcript_object, 'Test');

    if (result?.claim_number) {
      extracted++;
      console.log(`   ✅ EXTRACTED: ${result.claim_number}`);
      results.push({ callId: call.call_id, claimNumber: result.claim_number });
    } else {
      notExtracted++;
      console.log(`   ⏭️ No claim number extracted`);
    }
  }

  console.log('\n' + '='.repeat(100));
  console.log('SUMMARY:');
  console.log(`   Total calls with claim mentions: ${claimCalls.length}`);
  console.log(`   Successfully extracted: ${extracted}`);
  console.log(`   Not extracted: ${notExtracted}`);
  console.log('='.repeat(100));

  if (results.length > 0) {
    console.log('\nEXTRACTED CLAIM NUMBERS:');
    for (const r of results) {
      console.log(`   ${r.callId}: ${r.claimNumber}`);
    }
  }
}

finalVerification().catch(console.error);

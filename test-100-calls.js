// Test claim extraction on ALL 100 calls
// For each call, extract and show results for manual verification

require('dotenv').config();
const Retell = require('retell-sdk').default;

// Clear cache to get latest code
delete require.cache[require.resolve('./lib/extractAllCallData')];
const { extractAllCallData } = require('./lib/extractAllCallData');

const retellClient = new Retell({ apiKey: process.env.RETELL_API_KEY });

function getClaimContext(transcript) {
  // Find the claim-related section of the transcript
  let context = [];
  let inSection = false;

  for (let i = 0; i < transcript.length; i++) {
    const msg = transcript[i];
    const c = msg.content.toLowerCase();

    if (c.includes('claim') || c.includes('policy number') || c.includes('file number') || c.includes('case number')) {
      inSection = true;
    }

    if (inSection) {
      context.push(`[${i}] ${msg.role}: ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`);

      if (context.length > 8) break;

      // Stop if agent moves on
      if (msg.role === 'agent' && (
        c.includes('what specifically') ||
        c.includes('what can i help') ||
        c.includes('how can i help') ||
        c.includes('anything else')
      )) {
        break;
      }
    }
  }

  return context.join('\n      ');
}

async function testAll() {
  console.log('='.repeat(100));
  console.log('TESTING CLAIM EXTRACTION ON 100 CALLS');
  console.log('='.repeat(100));

  const calls = await retellClient.call.list({ limit: 100 });
  const withTranscripts = calls.filter(c => c.transcript_object && c.transcript_object.length > 0);

  console.log(`\nProcessing ${withTranscripts.length} calls with transcripts...\n`);

  let stats = {
    total: 0,
    extracted: 0,
    noClaimMentioned: 0,
    noClaimProvided: 0,
    results: []
  };

  for (const call of withTranscripts) {
    stats.total++;

    // Check if claim is mentioned
    const fullText = call.transcript_object.map(m => m.content.toLowerCase()).join(' ');
    const mentionsClaim = fullText.includes('claim') || fullText.includes('policy number') || fullText.includes('file number');

    if (!mentionsClaim) {
      stats.noClaimMentioned++;
      continue;
    }

    // Run extraction
    const result = await extractAllCallData(call.transcript_object, 'Test');
    const claimNumber = result?.claim_number;

    if (claimNumber) {
      stats.extracted++;
      stats.results.push({
        callId: call.call_id,
        claimNumber: claimNumber,
        date: new Date(call.start_timestamp).toLocaleString(),
        context: getClaimContext(call.transcript_object)
      });
    } else {
      stats.noClaimProvided++;
    }
  }

  // Print results
  console.log('\n' + '='.repeat(100));
  console.log('RESULTS SUMMARY');
  console.log('='.repeat(100));
  console.log(`Total calls processed: ${stats.total}`);
  console.log(`Calls without claim mention: ${stats.noClaimMentioned}`);
  console.log(`Calls with claim mention but no number provided: ${stats.noClaimProvided}`);
  console.log(`Calls with claim numbers extracted: ${stats.extracted}`);

  console.log('\n' + '='.repeat(100));
  console.log('EXTRACTED CLAIM NUMBERS - VERIFY EACH ONE');
  console.log('='.repeat(100));

  for (const r of stats.results) {
    console.log(`\n📞 ${r.callId}`);
    console.log(`📅 ${r.date}`);
    console.log(`🔢 EXTRACTED: ${r.claimNumber}`);
    console.log(`📜 Context:`);
    console.log(`      ${r.context}`);
    console.log(`   ❓ Is "${r.claimNumber}" correct based on the context above?`);
    console.log('-'.repeat(100));
  }

  console.log('\n' + '='.repeat(100));
  console.log('FINAL STATS');
  console.log('='.repeat(100));
  console.log(`Extraction rate: ${stats.extracted}/${stats.extracted + stats.noClaimProvided} calls with claim mentions`);
}

testAll().catch(console.error);

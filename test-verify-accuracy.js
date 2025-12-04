// Test to verify claim number extraction ACCURACY
// This pulls actual transcripts and shows you the exact conversation
// so you can verify the extraction is correct

require('dotenv').config();
const Retell = require('retell-sdk').default;

const retellClient = new Retell({ apiKey: process.env.RETELL_API_KEY });

// The calls we extracted claim numbers from
const callsToVerify = [
  { callId: 'call_25d97a29eb7e2fc9ff12dbbda5f', extracted: '283997515' },
  { callId: 'call_4e4f73804cc1e823ee3bb359d33', extracted: '067775711500000003' },
  { callId: 'call_f58bd1f130b2a2f9899cefd7424', extracted: '0441266900101021' },
  { callId: 'call_1cb6123a3e1071e99a20ce75bfe', extracted: '3214600001' },
  { callId: 'call_7c0fba91faadf41fa2b6aadf7d8', extracted: '0596781100101023' },
  { callId: 'call_59ca960bade7e57071a1d25bd9d', extracted: '41089621' },
];

// Also check some calls where we DIDN'T extract to see if we missed any
const callsToCheck = [
  'call_f7b4ddbfe33a35460271b5f45cb', // Had "three zero five zero h three nine eight h"
  'call_bfbf048e4c6a6a91ed3ccc105be', // Had "one two six two two nine three three one"
  'call_9bb688e31abcf47c243224b11b6', // Had "one two six two two nine three three one"
];

function getFullClaimExchange(transcript) {
  let inSection = false;
  let exchange = [];
  let beforeSection = [];

  for (let i = 0; i < transcript.length; i++) {
    const msg = transcript[i];
    const c = msg.content.toLowerCase();

    // Capture 2 messages before claim section starts
    if (!inSection) {
      beforeSection.push({ role: msg.role, content: msg.content, index: i });
      if (beforeSection.length > 2) beforeSection.shift();
    }

    if (c.includes('claim number') || c.includes('policy number') || c.includes('file number') || c.includes('claim') && c.includes('number')) {
      if (!inSection) {
        // Add the before context
        exchange.push(...beforeSection.map(m => `[${m.index}] ${m.role.toUpperCase()}: ${m.content}`));
      }
      inSection = true;
    }

    if (inSection) {
      exchange.push(`[${i}] ${msg.role.toUpperCase()}: ${msg.content}`);

      // End section when agent moves on
      if (msg.role === 'agent' && (
        c.includes('what specifically') ||
        c.includes('what can i help') ||
        c.includes('anything else') ||
        c.includes('is there anything') ||
        c.includes('i have all your information') ||
        c.includes('i\'ll have one of our')
      )) {
        break;
      }
    }

    if (exchange.length > 25) break;
  }

  return exchange.join('\n\n');
}

async function verifyAccuracy() {
  console.log('=' .repeat(100));
  console.log('VERIFICATION TEST: Checking if extracted claim numbers are ACCURATE');
  console.log('=' .repeat(100));

  // First, verify the ones we extracted
  console.log('\n\n📋 VERIFYING EXTRACTED CLAIM NUMBERS:\n');
  console.log('For each call, review the transcript and confirm the extracted number matches.\n');

  for (const item of callsToVerify) {
    try {
      const call = await retellClient.call.retrieve(item.callId);

      if (!call.transcript_object) {
        console.log(`\n❌ Call ${item.callId}: No transcript found`);
        continue;
      }

      console.log('\n' + '─'.repeat(100));
      console.log(`📞 CALL: ${item.callId}`);
      console.log(`🔢 EXTRACTED: ${item.extracted}`);
      console.log(`📅 DATE: ${new Date(call.start_timestamp).toLocaleString()}`);
      console.log('─'.repeat(100));
      console.log('\nRELEVANT TRANSCRIPT SECTION:\n');

      const exchange = getFullClaimExchange(call.transcript_object);
      console.log(exchange);

      console.log('\n' + '─'.repeat(100));
      console.log(`❓ VERIFY: Does "${item.extracted}" match what was confirmed in the transcript above?`);
      console.log('─'.repeat(100));

    } catch (err) {
      console.log(`\n❌ Error fetching call ${item.callId}: ${err.message}`);
    }
  }

  // Now check calls where we didn't extract but should have
  console.log('\n\n' + '='.repeat(100));
  console.log('📋 CHECKING CALLS WHERE WE DID NOT EXTRACT (but claim number was mentioned):');
  console.log('='.repeat(100));

  for (const callId of callsToCheck) {
    try {
      const call = await retellClient.call.retrieve(callId);

      if (!call.transcript_object) {
        console.log(`\n❌ Call ${callId}: No transcript found`);
        continue;
      }

      console.log('\n' + '─'.repeat(100));
      console.log(`📞 CALL: ${callId}`);
      console.log(`📅 DATE: ${new Date(call.start_timestamp).toLocaleString()}`);
      console.log('─'.repeat(100));
      console.log('\nRELEVANT TRANSCRIPT SECTION:\n');

      const exchange = getFullClaimExchange(call.transcript_object);
      console.log(exchange);

      console.log('\n' + '─'.repeat(100));
      console.log(`❓ SHOULD WE HAVE EXTRACTED A CLAIM NUMBER FROM THIS CALL?`);
      console.log('─'.repeat(100));

    } catch (err) {
      console.log(`\n❌ Error fetching call ${callId}: ${err.message}`);
    }
  }
}

verifyAccuracy().catch(console.error);

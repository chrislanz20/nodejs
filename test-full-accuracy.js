// Comprehensive accuracy test
// For each call that has a claim number, we:
// 1. Extract using our system
// 2. Show the relevant transcript so we can manually verify
// 3. Track pass/fail

require('dotenv').config();
const Retell = require('retell-sdk').default;
const { extractAllCallData } = require('./lib/extractAllCallData');
const retellClient = new Retell({ apiKey: process.env.RETELL_API_KEY });

// Helper to find claim section in transcript
function getClaimSection(transcript) {
  let inSection = false;
  let section = [];
  let startIdx = -1;

  for (let i = 0; i < transcript.length; i++) {
    const msg = transcript[i];
    const c = msg.content.toLowerCase();

    if (c.includes('claim number') || c.includes('policy number') || c.includes('file number') ||
        (c.includes('claim') && c.includes('number'))) {
      if (!inSection) startIdx = Math.max(0, i - 1);
      inSection = true;
    }

    if (inSection) {
      section.push({ idx: i, role: msg.role, content: msg.content });

      // End when agent moves to next topic
      if (msg.role === 'agent' && (
        c.includes('what specifically') ||
        c.includes('what can i help') ||
        c.includes('how can i help') ||
        c.includes('anything else') ||
        c.includes('is there anything else') ||
        c.includes('i have all your information') ||
        c.includes('i\'ll have one of our') ||
        c.includes('someone from our')
      )) {
        break;
      }
    }

    if (section.length > 20) break;
  }

  return section;
}

// Determine ground truth from transcript manually
function analyzeClaimSection(section) {
  const fullText = section.map(s => `${s.role}: ${s.content}`).join('\n');

  // Check if caller explicitly said no
  const callerSaidNo = section.some(s =>
    s.role === 'user' &&
    /^(no|nope|i don't have|don't have)\.?$/i.test(s.content.trim())
  );

  // Check if there's a confirmation (agent reads back, user confirms)
  let hasConfirmation = false;
  let confirmedNumber = null;

  for (let i = 0; i < section.length - 1; i++) {
    const msg = section[i];
    const nextMsg = section[i + 1];

    if (msg.role === 'agent' && nextMsg && nextMsg.role === 'user') {
      const agentText = msg.content.toLowerCase();
      const userText = nextMsg.content.toLowerCase().trim();

      // Agent is confirming a number
      const isConfirming = agentText.includes('is that correct') ||
                          agentText.includes('did i get that') ||
                          agentText.includes('to confirm') ||
                          agentText.includes('let me repeat') ||
                          agentText.includes('i heard');

      // And mentions claim
      const aboutClaim = agentText.includes('claim') || agentText.includes('number');

      // User confirms
      const userConfirms = ['yes', 'yes.', 'yeah', 'yeah.', 'yep', 'correct', 'correct.', 'alright'].includes(userText) ||
                          userText.startsWith('yes') || userText.includes("that's right");

      if (isConfirming && aboutClaim && userConfirms) {
        hasConfirmation = true;
        // The number is in the agent's message
        confirmedNumber = msg.content;
        break;
      }
    }
  }

  return {
    callerSaidNo,
    hasConfirmation,
    confirmedNumber,
    fullText
  };
}

async function runFullTest() {
  console.log('='.repeat(100));
  console.log('FULL ACCURACY TEST - Analyzing all calls with claim mentions');
  console.log('='.repeat(100));

  const calls = await retellClient.call.list({ limit: 100 });
  const withTranscripts = calls.filter(c => c.transcript_object && c.transcript_object.length > 0);

  const mentionsClaim = withTranscripts.filter(c => {
    const text = c.transcript_object.map(m => m.content.toLowerCase()).join(' ');
    return text.includes('claim') || text.includes('policy number') || text.includes('file number');
  });

  console.log(`\nAnalyzing ${mentionsClaim.length} calls that mention claims...\n`);

  let results = {
    correct: [],
    incorrect: [],
    needsReview: [],
    noClaimProvided: []
  };

  for (const call of mentionsClaim) {
    const section = getClaimSection(call.transcript_object);
    const analysis = analyzeClaimSection(section);

    // Run our extraction
    const extracted = await extractAllCallData(call.transcript_object, 'Test');
    const claimNumber = extracted?.claim_number;

    console.log('\n' + '─'.repeat(100));
    console.log(`CALL: ${call.call_id}`);
    console.log(`DATE: ${new Date(call.start_timestamp).toLocaleString()}`);
    console.log('─'.repeat(100));

    // Show the claim section
    console.log('\nCLAIM SECTION:');
    for (const s of section.slice(0, 12)) {
      const prefix = s.role === 'agent' ? '🤖 AGENT' : '👤 USER';
      console.log(`  [${s.idx}] ${prefix}: ${s.content.substring(0, 120)}${s.content.length > 120 ? '...' : ''}`);
    }

    console.log('\n📊 ANALYSIS:');
    console.log(`  Caller said no: ${analysis.callerSaidNo}`);
    console.log(`  Has confirmation: ${analysis.hasConfirmation}`);
    console.log(`  Our extraction: ${claimNumber || 'null'}`);

    // Categorize
    if (analysis.callerSaidNo && !analysis.hasConfirmation) {
      if (claimNumber === null) {
        console.log('  ✅ CORRECT - No claim number (caller said no)');
        results.noClaimProvided.push(call.call_id);
      } else {
        // Check if claim was provided LATER in the call
        const laterProvided = section.some(s =>
          s.role === 'user' &&
          /\d{5,}/.test(s.content.replace(/\s/g, ''))
        );
        if (laterProvided) {
          console.log('  ✅ CORRECT - Caller initially said no but provided later');
          results.correct.push({ callId: call.call_id, extracted: claimNumber });
        } else {
          console.log('  ❓ NEEDS REVIEW - Extracted number but caller said no');
          results.needsReview.push({ callId: call.call_id, extracted: claimNumber, reason: 'Caller said no but we extracted' });
        }
      }
    } else if (analysis.hasConfirmation) {
      if (claimNumber) {
        console.log('  ✅ LIKELY CORRECT - Extracted from confirmed readback');
        results.correct.push({ callId: call.call_id, extracted: claimNumber });
      } else {
        console.log('  ❓ NEEDS REVIEW - Has confirmation but no extraction');
        results.needsReview.push({ callId: call.call_id, extracted: null, reason: 'Has confirmation but no extraction' });
      }
    } else {
      if (claimNumber) {
        console.log('  ❓ NEEDS REVIEW - Extracted but no clear confirmation');
        results.needsReview.push({ callId: call.call_id, extracted: claimNumber, reason: 'No clear confirmation pattern' });
      } else {
        console.log('  ⚪ NO CLAIM - No confirmation found and no extraction');
        results.noClaimProvided.push(call.call_id);
      }
    }
  }

  // Summary
  console.log('\n\n' + '='.repeat(100));
  console.log('SUMMARY');
  console.log('='.repeat(100));
  console.log(`✅ Correct/Likely Correct: ${results.correct.length}`);
  console.log(`⚪ No Claim Provided: ${results.noClaimProvided.length}`);
  console.log(`❓ Needs Manual Review: ${results.needsReview.length}`);

  if (results.needsReview.length > 0) {
    console.log('\n❓ CALLS NEEDING REVIEW:');
    for (const r of results.needsReview) {
      console.log(`  ${r.callId}: ${r.reason} (extracted: ${r.extracted})`);
    }
  }

  console.log('\n✅ EXTRACTED CLAIM NUMBERS:');
  for (const r of results.correct) {
    console.log(`  ${r.callId}: ${r.extracted}`);
  }
}

runFullTest().catch(console.error);

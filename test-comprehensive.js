// Comprehensive test: Find ALL calls with claim numbers and test extraction
// Also verify we're not accidentally extracting phone numbers, emails, etc.

require('dotenv').config();
const Retell = require('retell-sdk').default;

const retellClient = new Retell({ apiKey: process.env.RETELL_API_KEY });

// Word to digit mapping
const wordMap = {
  'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
  'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
  'oh': '0', 'o': '0'
};

// Extract from agent's readback
function extractFromAgentReadback(text) {
  let result = '';

  let cleanedText = text
    .replace(/then\s+six\s+zeros[—\-\s]*(?=0\s+0)/gi, '')
    .replace(/six\s+zeros[—\-\s]*(?=0\s+0)/gi, '')
    .replace(/seven\s+zeros[—\-\s]*(?=0\s+0)/gi, '')
    .replace(/then\s+six\s+zeros/gi, ' 0 0 0 0 0 0 ')
    .replace(/six\s+zeros/gi, ' 0 0 0 0 0 0 ')
    .replace(/seven\s+zeros/gi, ' 0 0 0 0 0 0 0 ')
    .replace(/five\s+zeros/gi, ' 0 0 0 0 0 ')
    .replace(/four\s+zeros/gi, ' 0 0 0 0 ')
    .replace(/three\s+zeros/gi, ' 0 0 0 ')
    .replace(/two\s+zeros/gi, ' 0 0 ');

  const letterPattern = /([A-Z])\s+as\s+in\s+\w+/gi;
  let letterMatch;
  while ((letterMatch = letterPattern.exec(cleanedText)) !== null) {
    result += letterMatch[1].toUpperCase();
  }

  const dashPattern = /(\d(?:-\d)+)/g;
  let dashMatch;
  while ((dashMatch = dashPattern.exec(cleanedText)) !== null) {
    result += dashMatch[1].replace(/-/g, '');
  }

  const spacedDigitPattern = /(\d(?:\s+\d)+)/g;
  let digitMatch;
  while ((digitMatch = spacedDigitPattern.exec(cleanedText)) !== null) {
    result += digitMatch[1].replace(/\s+/g, '');
  }

  const numberWords = 'zero|one|two|three|four|five|six|seven|eight|nine|oh';
  const wordSequencePattern = new RegExp(`((?:${numberWords})(?:[\\s,]+(?:${numberWords}))+)`, 'gi');
  let wordMatch;
  while ((wordMatch = wordSequencePattern.exec(cleanedText)) !== null) {
    const words = wordMatch[0].toLowerCase().split(/[\s,]+/);
    for (const word of words) {
      const trimmed = word.trim();
      if (wordMap[trimmed]) {
        result += wordMap[trimmed];
      }
    }
  }

  const endsWithPattern = /ends?\s+(?:with|in)\s+(?:a\s+)?(\d|one|two|three|four|five|six|seven|eight|nine)/gi;
  let endsMatch;
  while ((endsMatch = endsWithPattern.exec(cleanedText)) !== null) {
    const val = endsMatch[1].toLowerCase();
    result += wordMap[val] || val;
  }

  const dashEndPattern = /dash\s+(\d|one|two|three|four|five|six|seven|eight|nine)/gi;
  let dashEndMatch;
  while ((dashEndMatch = dashEndPattern.exec(cleanedText)) !== null) {
    const val = dashEndMatch[1].toLowerCase();
    result += wordMap[val] || val;
  }

  return result;
}

// Find the agent's confirmed claim number readback
function extractClaimNumber(transcript) {
  let inClaimSection = false;
  let agentConfirmation = null;
  let confirmationIndex = -1;
  let userConfirmed = false;

  for (let i = 0; i < transcript.length; i++) {
    const msg = transcript[i];
    const content = msg.content.toLowerCase();

    if (content.includes('claim number') || content.includes('policy number') ||
        content.includes('file number') || content.includes('our file')) {
      inClaimSection = true;
    }

    if (!inClaimSection) continue;

    if (msg.role === 'agent') {
      const isConfirmation =
        content.includes('is that correct') ||
        content.includes('did i get that right') ||
        content.includes('did i get it right') ||
        content.includes('let me confirm') ||
        content.includes('let me read that back') ||
        content.includes('let me repeat') ||
        content.includes('let me make sure') ||
        content.includes('to confirm') ||
        content.includes('to make sure i have') ||
        content.includes('i heard');

      if (isConfirmation) {
        const isAboutPhone = content.includes('phone number') || content.includes('reach you') || content.includes('extension');
        const isAboutEmail = content.includes('email') || content.includes('@') || content.includes('dot com');
        const isAboutName = content.includes('full name') || content.includes('spelling that') || content.includes('spelled');

        const mentionsClaimOrNumber = content.includes('claim') || content.includes('policy') ||
                                       content.includes('file number') ||
                                       (inClaimSection && content.includes('the number')) ||
                                       (inClaimSection && content.includes('i heard'));

        if (!isAboutPhone && !isAboutEmail && !isAboutName && mentionsClaimOrNumber) {
          agentConfirmation = msg.content;
          confirmationIndex = i;
        }
      }
    }

    if (msg.role === 'user' && agentConfirmation && i > confirmationIndex) {
      const c = content.trim();
      if (c === 'yes' || c === 'yes.' || c === 'correct' || c === 'correct.' ||
          c === 'yeah' || c === 'yeah.' || c === 'yep' || c === 'yep.' ||
          c.includes("that's right") || c.includes('thats right') ||
          c.startsWith('yes,') || c.startsWith('yeah,') ||
          c.includes('six zeros')) {
        userConfirmed = true;
        break;
      }
      if (content.includes('incorrect') || c === 'no' || c === 'no.') {
        agentConfirmation = null;
        confirmationIndex = -1;
      }
    }
  }

  if (!agentConfirmation || !userConfirmed) {
    return { confirmation: null, extracted: null };
  }

  const extracted = extractFromAgentReadback(agentConfirmation);

  return {
    confirmation: agentConfirmation,
    extracted: extracted.length >= 5 ? extracted : null
  };
}

// Check if transcript mentions a claim number at all
function hasClaimNumberMention(transcript) {
  const text = transcript.map(m => m.content.toLowerCase()).join(' ');
  return text.includes('claim number') || text.includes('policy number') || text.includes('file number');
}

// Get the claim exchange portion for manual review
function getClaimExchange(transcript) {
  let inSection = false;
  let exchange = [];

  for (const msg of transcript) {
    const c = msg.content.toLowerCase();
    if (c.includes('claim number') || c.includes('policy number') || c.includes('file number')) {
      inSection = true;
    }
    if (inSection) {
      exchange.push(`${msg.role.toUpperCase()}: ${msg.content}`);
      if (msg.role === 'agent' && (c.includes('what specifically') || c.includes('what can i help') || c.includes('anything else'))) {
        break;
      }
    }
    if (exchange.length > 15) break; // Limit output
  }
  return exchange.join('\n');
}

async function comprehensiveTest() {
  console.log('Fetching all recent calls...\n');

  const calls = await retellClient.call.list({ limit: 100 });
  const callsWithTranscripts = calls.filter(c => c.transcript_object && c.transcript_object.length > 0);

  console.log(`Total calls with transcripts: ${callsWithTranscripts.length}\n`);

  // Find calls that mention claim numbers
  const callsWithClaimMention = callsWithTranscripts.filter(c => hasClaimNumberMention(c.transcript_object));

  console.log(`Calls that mention claim/policy/file number: ${callsWithClaimMention.length}\n`);
  console.log('='.repeat(80));

  let extracted = 0;
  let notExtracted = 0;
  const results = [];

  for (const call of callsWithClaimMention) {
    const result = extractClaimNumber(call.transcript_object);

    console.log(`\nCALL: ${call.call_id}`);

    if (result.extracted) {
      extracted++;
      console.log(`✅ EXTRACTED: ${result.extracted}`);
      console.log(`   From: "${result.confirmation.substring(0, 100)}..."`);
      results.push({ callId: call.call_id, extracted: result.extracted, status: 'extracted' });
    } else {
      notExtracted++;
      console.log(`⏭️  No confirmed claim number found`);

      // Show the claim exchange for manual review
      const exchange = getClaimExchange(call.transcript_object);
      if (exchange) {
        console.log(`   --- Claim Exchange Preview ---`);
        const lines = exchange.split('\n').slice(0, 6);
        for (const line of lines) {
          console.log(`   ${line.substring(0, 100)}`);
        }
      }
      results.push({ callId: call.call_id, extracted: null, status: 'not_extracted' });
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY:');
  console.log(`  Calls mentioning claim numbers: ${callsWithClaimMention.length}`);
  console.log(`  Successfully extracted: ${extracted}`);
  console.log(`  Not extracted (no confirmation): ${notExtracted}`);

  if (extracted > 0) {
    console.log(`\n✅ EXTRACTED CLAIM NUMBERS:`);
    for (const r of results.filter(r => r.extracted)) {
      console.log(`   ${r.callId}: ${r.extracted}`);
    }
  }

  // Verify none look like phone numbers (10 digits starting with area code patterns)
  console.log('\n🔍 SANITY CHECK - Verifying extracted numbers are NOT phone numbers:');
  const phonePattern = /^[2-9]\d{2}[2-9]\d{6}$/; // Standard US phone format
  for (const r of results.filter(r => r.extracted)) {
    const looksLikePhone = phonePattern.test(r.extracted) && r.extracted.length === 10;
    if (looksLikePhone) {
      console.log(`   ⚠️ WARNING: ${r.extracted} might be a phone number!`);
    } else {
      console.log(`   ✅ ${r.extracted} - OK (not a phone number pattern)`);
    }
  }
}

comprehensiveTest().catch(console.error);

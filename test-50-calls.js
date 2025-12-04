// Test claim number extraction on production calls
// Strategy: Extract from agent's confirmed readback (what the user said "yes" to)

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

  // Handle "X as in Word" letter patterns first
  const letterPattern = /([A-Z])\s+as\s+in\s+\w+/gi;
  let letterMatch;
  while ((letterMatch = letterPattern.exec(text)) !== null) {
    result += letterMatch[1].toUpperCase();
  }

  // Handle dash-separated digits (2-8-3-9-9-7-5-1)
  const dashPattern = /(\d(?:-\d)+)/g;
  let dashMatch;
  while ((dashMatch = dashPattern.exec(text)) !== null) {
    result += dashMatch[1].replace(/-/g, '');
  }

  // Find sequences of spaced single digits
  const spacedDigitPattern = /(\d(?:\s+\d)+)/g;
  let digitMatch;
  while ((digitMatch = spacedDigitPattern.exec(text)) !== null) {
    result += digitMatch[1].replace(/\s+/g, '');
  }

  // Handle word-form numbers in sequence (with or without commas)
  const numberWords = 'zero|one|two|three|four|five|six|seven|eight|nine|oh';
  const wordSequencePattern = new RegExp(`((?:${numberWords})(?:[\\s,]+(?:${numberWords}))+)`, 'gi');
  let wordMatch;
  while ((wordMatch = wordSequencePattern.exec(text)) !== null) {
    const words = wordMatch[0].toLowerCase().split(/[\s,]+/);
    for (const word of words) {
      const trimmed = word.trim();
      if (wordMap[trimmed]) {
        result += wordMap[trimmed];
      }
    }
  }

  // Handle "ends with a X" patterns
  const endsWithPattern = /ends?\s+(?:with|in)\s+(?:a\s+)?(\d|one|two|three|four|five|six|seven|eight|nine)/gi;
  let endsMatch;
  while ((endsMatch = endsWithPattern.exec(text)) !== null) {
    const val = endsMatch[1].toLowerCase();
    result += wordMap[val] || val;
  }

  // Handle standalone "dash X" at end (like "dash 5" or "dash one")
  const dashEndPattern = /dash\s+(\d|one|two|three|four|five|six|seven|eight|nine)/gi;
  let dashEndMatch;
  while ((dashEndMatch = dashEndPattern.exec(text)) !== null) {
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

    // Start tracking when claim/policy/file number is mentioned
    if (content.includes('claim number') || content.includes('policy number') ||
        content.includes('file number') || content.includes('our file')) {
      inClaimSection = true;
    }

    if (!inClaimSection) continue;

    // Look for agent confirmation/readback patterns
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
        // STRICT exclusion for non-claim confirmations
        const isAboutPhone = content.includes('phone') || content.includes('reach you') || content.includes('extension');
        const isAboutEmail = content.includes('email') || content.includes('@') || content.includes('dot com');
        const isAboutName = content.includes('full name') || content.includes('spelling') || content.includes('spelled');

        // Check if this confirmation mentions claim/policy context
        const mentionsClaim = content.includes('claim') || content.includes('policy') || content.includes('file number');

        if (!isAboutPhone && !isAboutEmail && !isAboutName && mentionsClaim) {
          agentConfirmation = msg.content;
          confirmationIndex = i;
        }
      }
    }

    // Check if user confirmed
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

// Get calls and test extraction - paginate to get more
async function testAllCalls() {
  console.log('Fetching calls from Retell (multiple pages)...\n');

  let allCalls = [];
  let nextCursor = null;

  // Fetch multiple pages
  for (let page = 0; page < 10; page++) {
    const options = { limit: 100 };
    if (nextCursor) {
      options.pagination_key = nextCursor;
    }

    const response = await retellClient.call.list(options);

    if (Array.isArray(response)) {
      allCalls = allCalls.concat(response);
      break; // No pagination info, just got array
    } else if (response.calls) {
      allCalls = allCalls.concat(response.calls);
      nextCursor = response.next_cursor;
      if (!nextCursor) break;
    } else {
      allCalls = allCalls.concat(response);
      break;
    }
  }

  const callsWithTranscripts = allCalls.filter(c => c.transcript_object && c.transcript_object.length > 0);

  console.log(`Total calls fetched: ${allCalls.length}`);
  console.log(`Calls with transcripts: ${callsWithTranscripts.length}\n`);

  let tested = 0;
  let extracted = 0;
  let noClaimFound = 0;
  const results = [];

  for (const call of callsWithTranscripts) {
    const result = extractClaimNumber(call.transcript_object);

    if (result.extracted) {
      tested++;
      extracted++;
      results.push({
        callId: call.call_id,
        confirmation: result.confirmation,
        extracted: result.extracted,
        status: '✅'
      });
      console.log(`[${tested}] ${call.call_id}: ${result.extracted}`);
    } else if (result.confirmation === null) {
      noClaimFound++;
    } else {
      tested++;
      results.push({
        callId: call.call_id,
        confirmation: result.confirmation,
        extracted: null,
        status: '❌ FAILED TO EXTRACT'
      });
      console.log(`[${tested}] ${call.call_id}: ❌ FAILED`);
      console.log(`    Confirmation: ${result.confirmation}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`SUMMARY:`);
  console.log(`  Total calls with transcripts: ${callsWithTranscripts.length}`);
  console.log(`  Calls with claim numbers: ${tested}`);
  console.log(`  Successful extractions: ${extracted}`);
  console.log(`  Calls without claim confirmations: ${noClaimFound}`);
  if (tested > 0) {
    console.log(`  Success rate: ${((extracted / tested) * 100).toFixed(1)}%`);
  }

  const failures = results.filter(r => r.status.includes('FAILED'));
  if (failures.length > 0) {
    console.log('\n❌ FAILURES:');
    for (const f of failures) {
      console.log(`\n  Call: ${f.callId}`);
      console.log(`  Confirmation: ${f.confirmation}`);
    }
  }
}

testAllCalls().catch(console.error);

// Test claim number extraction on known difficult calls

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

  // FIRST: Handle "X zeros" phrases
  // If followed by explicit zeros (like "six zeros—0 0 0 0 0 0"), just remove the phrase
  // If NOT followed by explicit zeros, expand the phrase
  let cleanedText = text
    // Remove "six zeros" when followed by explicit zeros (agent says both)
    .replace(/then\s+six\s+zeros[—\-\s]*(?=0\s+0)/gi, '')
    .replace(/six\s+zeros[—\-\s]*(?=0\s+0)/gi, '')
    .replace(/seven\s+zeros[—\-\s]*(?=0\s+0)/gi, '')
    // If NOT followed by explicit zeros, expand them
    .replace(/then\s+six\s+zeros/gi, ' 0 0 0 0 0 0 ')
    .replace(/six\s+zeros/gi, ' 0 0 0 0 0 0 ')
    .replace(/seven\s+zeros/gi, ' 0 0 0 0 0 0 0 ')
    .replace(/five\s+zeros/gi, ' 0 0 0 0 0 ')
    .replace(/four\s+zeros/gi, ' 0 0 0 0 ')
    .replace(/three\s+zeros/gi, ' 0 0 0 ')
    .replace(/two\s+zeros/gi, ' 0 0 ');

  // Handle "X as in Word" letter patterns first
  const letterPattern = /([A-Z])\s+as\s+in\s+\w+/gi;
  let letterMatch;
  while ((letterMatch = letterPattern.exec(cleanedText)) !== null) {
    result += letterMatch[1].toUpperCase();
  }

  // Handle dash-separated digits (2-8-3-9-9-7-5-1)
  const dashPattern = /(\d(?:-\d)+)/g;
  let dashMatch;
  while ((dashMatch = dashPattern.exec(cleanedText)) !== null) {
    result += dashMatch[1].replace(/-/g, '');
  }

  // Find sequences of spaced single digits
  const spacedDigitPattern = /(\d(?:\s+\d)+)/g;
  let digitMatch;
  while ((digitMatch = spacedDigitPattern.exec(cleanedText)) !== null) {
    result += digitMatch[1].replace(/\s+/g, '');
  }

  // Handle word-form numbers in sequence (with or without commas)
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

  // Handle "ends with a X" patterns
  const endsWithPattern = /ends?\s+(?:with|in)\s+(?:a\s+)?(\d|one|two|three|four|five|six|seven|eight|nine)/gi;
  let endsMatch;
  while ((endsMatch = endsWithPattern.exec(cleanedText)) !== null) {
    const val = endsMatch[1].toLowerCase();
    result += wordMap[val] || val;
  }

  // Handle standalone "dash X" at end (like "dash 5" or "dash one")
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
        const isAboutPhone = content.includes('phone number') || content.includes('reach you') || content.includes('extension');
        const isAboutEmail = content.includes('email') || content.includes('@') || content.includes('dot com');
        const isAboutName = content.includes('full name') || content.includes('spelling that') || content.includes('spelled');

        // The confirmation either mentions claim/policy OR we're already in claim section and it's about "the number"
        const mentionsClaimOrNumber = content.includes('claim') || content.includes('policy') ||
                                       content.includes('file number') ||
                                       (inClaimSection && content.includes('the number'));

        if (!isAboutPhone && !isAboutEmail && !isAboutName && mentionsClaimOrNumber) {
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

// Test on known difficult calls
async function testKnownCalls() {
  const testCalls = [
    { id: 'call_938d164eb068ed689968de5cd8d', expected: '8796596610000001', desc: '"ends with a 1" case' },
    { id: 'call_25d97a29eb7e2fc9ff12dbbda5f', expected: '283997515', desc: 'dash-separated' },
    { id: 'call_4e4f73804cc1e823ee3bb359d33', expected: '067775711500000003', desc: 'agent transcription error' },
    { id: 'call_bfc2c287f3e2b54d0deaaee852e', expected: 'LA3590525821300005', desc: '"L as in Larry" format' },
    { id: 'call_1cb6123a3e1071e99a20ce75bfe', expected: '3214600001', desc: 'standard case' },
    { id: 'call_7c0fba91faadf41fa2b6aadf7d8', expected: '0596781100101023', desc: 'word-form numbers' },
    { id: 'call_59ca960bade7e57071a1d25bd9d', expected: '41089621', desc: 'dash-separated word form' },
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

      const result = extractClaimNumber(transcript);

      console.log(`AGENT CONFIRMATION: ${result.confirmation}`);
      console.log(`EXTRACTED: ${result.extracted}`);

      if (result.extracted === expected) {
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

testKnownCalls().catch(console.error);

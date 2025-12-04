// Test: Extract claim number from transcript
// Strategy: Extract from agent's confirmed readback (what the user said "yes" to)
// This is the source of truth - what was confirmed in the conversation

require('dotenv').config();
const Retell = require('retell-sdk').default;

const retellClient = new Retell({ apiKey: process.env.RETELL_API_KEY });

// Word to digit mapping
const wordMap = {
  'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
  'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
  'oh': '0', 'o': '0'
};

// Extract from agent's readback (handles formatted output like "8 7 9 6")
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

  // Handle word-form numbers in comma-separated sequence
  const wordPattern = /(zero|one|two|three|four|five|six|seven|eight|nine)(?:\s*,\s*(zero|one|two|three|four|five|six|seven|eight|nine))+/gi;
  let wordMatch;
  while ((wordMatch = wordPattern.exec(text)) !== null) {
    const words = wordMatch[0].toLowerCase().split(/\s*,\s*/);
    for (const word of words) {
      if (wordMap[word.trim()]) {
        result += wordMap[word.trim()];
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

  // Handle standalone "dash X" at end
  const dashEndPattern = /dash\s+(\d)/gi;
  let dashEndMatch;
  while ((dashEndMatch = dashEndPattern.exec(text)) !== null) {
    result += dashEndMatch[1];
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
        content.includes('to make sure i have');

      if (isConfirmation) {
        // Exclude phone/email confirmations
        const isAboutPhone = content.includes('phone') || content.includes('reach you');
        const isAboutEmail = content.includes('email') || content.includes('@');

        if (!isAboutPhone && !isAboutEmail) {
          agentConfirmation = msg.content;
          confirmationIndex = i;
        }
      }
    }

    // Check if user confirmed (must be after the agent's confirmation)
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
      // If user says "incorrect", reset and keep looking
      if (content.includes('incorrect') || c === 'no' || c === 'no.') {
        agentConfirmation = null;
        confirmationIndex = -1;
      }
    }
  }

  if (!agentConfirmation || !userConfirmed) {
    return { confirmation: null, extracted: null };
  }

  // Extract the number from the agent's confirmed readback
  const extracted = extractFromAgentReadback(agentConfirmation);

  return {
    confirmation: agentConfirmation,
    extracted: extracted.length >= 5 ? extracted : null
  };
}

// Test on real calls
// Note: Expected values are what was CONFIRMED in the transcript, not what user originally said
async function test() {
  const testCalls = [
    { id: 'call_938d164eb068ed689968de5cd8d', expected: '8796596610000001' },
    { id: 'call_25d97a29eb7e2fc9ff12dbbda5f', expected: '283997515' },
    { id: 'call_4e4f73804cc1e823ee3bb359d33', expected: '067775711500000003' }, // Agent had transcription error, user still confirmed
    { id: 'call_bfc2c287f3e2b54d0deaaee852e', expected: 'LA3590525821300005' },
  ];

  let correct = 0;

  for (const { id: callId, expected } of testCalls) {
    console.log('\n' + '='.repeat(70));
    console.log(`CALL: ${callId}`);
    console.log(`EXPECTED: ${expected}`);

    const call = await retellClient.call.retrieve(callId);
    const transcript = call.transcript_object;

    const result = extractClaimNumber(transcript);

    console.log(`\nAGENT CONFIRMATION: ${result.confirmation}`);
    console.log(`EXTRACTED: ${result.extracted}`);

    if (result.extracted === expected) {
      console.log(`✅ CORRECT`);
      correct++;
    } else {
      console.log(`❌ WRONG - expected ${expected}`);
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`RESULTS: ${correct}/${testCalls.length} correct`);
}

test().catch(console.error);

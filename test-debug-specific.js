// Debug the specific extraction issue for call_59ca960bade7e57071a1d25bd9d
require('dotenv').config();
const Retell = require('retell-sdk').default;
const retellClient = new Retell({ apiKey: process.env.RETELL_API_KEY });

// Copy the extractFromAgentReadback function
const wordMap = {
  'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
  'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
  'oh': '0', 'o': '0'
};

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

  // Handle "X as in Word" letter patterns first (L as in Larry, A as in Apple)
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

  // Find sequences of spaced single digits (8 7 9 6 5 9 6 6)
  const spacedDigitPattern = /(\d(?:\s+\d)+)/g;
  let digitMatch;
  while ((digitMatch = spacedDigitPattern.exec(cleanedText)) !== null) {
    result += digitMatch[1].replace(/\s+/g, '');
  }

  // Handle word-form numbers in sequence (three, five, nine, zero)
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

async function debug() {
  const call = await retellClient.call.retrieve('call_59ca960bade7e57071a1d25bd9d');
  const transcript = call.transcript_object;

  console.log('=== DEBUGGING extractClaimNumberFromConfirmedReadback ===\n');

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
      if (!inClaimSection) {
        console.log(`[${i}] Entering claim section`);
      }
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
        content.includes('i heard') ||
        content.includes('you said') ||
        content.includes('the claim number is') ||
        content.includes('the number is');

      if (isConfirmation) {
        const isAboutPhone = content.includes('phone number') || content.includes('reach you') || content.includes('extension');
        const isAboutEmail = content.includes('email') || content.includes('@') || content.includes('dot com');
        const isAboutName = content.includes('full name') || content.includes('spelling that') || content.includes('spelled');

        const mentionsClaimOrNumber = content.includes('claim') || content.includes('policy') ||
                                       content.includes('file number') ||
                                       (inClaimSection && content.includes('the number')) ||
                                       (inClaimSection && content.includes('i heard'));

        console.log(`[${i}] Agent message: isConfirmation=${isConfirmation}, isAboutPhone=${isAboutPhone}, isAboutEmail=${isAboutEmail}, isAboutName=${isAboutName}, mentionsClaimOrNumber=${mentionsClaimOrNumber}`);

        if (!isAboutPhone && !isAboutEmail && !isAboutName && mentionsClaimOrNumber) {
          agentConfirmation = msg.content;
          confirmationIndex = i;
          console.log(`[${i}] ✓ Found agent confirmation: "${msg.content.substring(0, 80)}..."`);
        }
      }
    }

    // Check if user confirmed
    if (msg.role === 'user' && agentConfirmation && i > confirmationIndex) {
      const c = content.trim();
      console.log(`[${i}] User message: "${c}"`);

      if (c === 'yes' || c === 'yes.' || c === 'correct' || c === 'correct.' ||
          c === 'yeah' || c === 'yeah.' || c === 'yep' || c === 'yep.' ||
          c === 'alright' || c === 'alright.' || c === 'all right' || c === 'all right.' ||
          c.includes("that's right") || c.includes('thats right') ||
          c.startsWith('yes,') || c.startsWith('yeah,')) {
        userConfirmed = true;
        console.log(`[${i}] ✓ User confirmed!`);
        continue;
      }
    }

    // Stop processing when agent moves on to next topic
    if (msg.role === 'agent' && userConfirmed) {
      const movingOn = content.includes('what specifically') ||
                       content.includes('anything else') ||
                       content.includes('is there anything') ||
                       content.includes('how can i help') ||
                       content.includes('what can i help');
      if (movingOn) {
        console.log(`[${i}] Agent moving on, breaking`);
        break;
      }
    }
  }

  console.log('\n=== EXTRACTION ===');
  console.log(`agentConfirmation: ${agentConfirmation ? agentConfirmation.substring(0, 100) + '...' : 'null'}`);
  console.log(`userConfirmed: ${userConfirmed}`);

  if (agentConfirmation && userConfirmed) {
    const extracted = extractFromAgentReadback(agentConfirmation);
    console.log(`\nextractFromAgentReadback result: "${extracted}"`);
    console.log(`Length: ${extracted.length}`);
    console.log(`Has digit: ${/\d/.test(extracted)}`);
    console.log(`Expected: 41089621`);
  }
}

debug().catch(console.error);

// Extract structured data from ALL call types using AI
// Works for: New Leads, Attorneys, Medical Professionals, Insurance, Other callers
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 30000, // 30 seconds - prevents hanging on slow API calls
  maxRetries: 2   // Retry twice on failure
});

/**
 * Check if a user message is a confirmation (yes, correct, etc.)
 */
function isConfirmation(text) {
  const confirmWords = ['yes', 'yeah', 'yep', 'correct', 'right', 'that\'s right', 'thats right', 'perfect', 'that is correct', 'you got it', 'exactly'];
  const lower = text.toLowerCase().trim();
  return confirmWords.some(word => lower === word || lower.startsWith(word + '.') || lower.startsWith(word + ',') || lower.startsWith(word + ' '));
}

/**
 * Check if the transcript indicates the caller explicitly said they don't have a claim number
 */
function callerSaidNoClaimNumber(transcriptArray) {
  const transcriptText = transcriptArray.map(m => m.content.toLowerCase()).join(' ');

  // Patterns indicating caller explicitly doesn't have a claim number
  const noClaimPatterns = [
    /no claim numbers?/i,
    /don't have a claim/i,
    /do not have a claim/i,
    /i don't have the claim/i,
    /i can see that no claim/i,
    /there is no claim/i,
    /there's no claim/i,
    /don't have any claim/i
  ];

  return noClaimPatterns.some(pattern => pattern.test(transcriptText));
}

/**
 * Check if the context indicates this is a name being spelled, not a claim number
 */
function isNameSpelling(agentText, transcriptArray, messageIndex) {
  const content = agentText.toLowerCase();

  // Check if agent is spelling out a NAME (not claim number)
  // Look for patterns like "claimant's name is" + letter spelling
  const isNameContext = (
    content.includes('name is') ||
    content.includes('claimant is') ||
    content.includes('patient is') ||
    content.includes('patient name') ||
    content.includes('caller name') ||
    content.includes('your name')
  );

  // If it's in a name context and has letter spelling patterns, it's a name not claim number
  if (isNameContext) {
    // Check for letter-by-letter spelling (like "B E L A C R U Z" or "B as in boy")
    const hasLetterSpelling = /\b[A-Z]\s+[A-Z]\s+[A-Z]/i.test(agentText) ||
                              /\b[A-Z]\s+as\s+in/i.test(agentText);
    if (hasLetterSpelling) {
      return true;
    }
  }

  return false;
}

/**
 * Extract claim number from agent's CONFIRMED readback
 * This is the source of truth - what the agent read back and user confirmed
 *
 * The agent says things like:
 * - "8 7 9 6 5 9 6 6 1, then six zeros—0 0 0 0 0 0—and it ends with a 1"
 * - "L as in Larry, A as in Apple, three, five, nine..."
 * - "2-8-3-9-9-7-5-1 dash 5"
 *
 * We extract the literal digits/letters from this.
 */
function extractFromAgentReadback(text) {
  const wordMap = {
    'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
    'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
    'oh': '0', 'o': '0'
  };

  let result = '';

  // FIRST: Handle "X zeros" phrases
  // If followed by explicit zeros (like "six zeros—0 0 0 0 0 0"), just remove the phrase
  // If NOT followed by explicit zeros, expand the phrase
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

/**
 * Find the agent's confirmed claim number readback from transcript
 * Returns the claim number that was confirmed by the user saying "yes"
 */
function extractClaimNumberFromConfirmedReadback(transcript) {
  if (!Array.isArray(transcript) || transcript.length === 0) {
    return null;
  }

  let inClaimSection = false;
  let agentConfirmation = null;
  let confirmationIndex = -1;
  let userConfirmed = false;
  let userZeroCorrection = null; // Track if user corrects the zero count

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
        content.includes('i heard') ||
        content.includes('you said') ||  // "You said the Claim Number is..."
        content.includes('the claim number is') ||  // Agent stating back the claim number
        content.includes('the number is');

      if (isConfirmation) {
        // STRICT exclusion for non-claim confirmations
        const isAboutPhone = content.includes('phone number') || content.includes('reach you') || content.includes('extension');
        const isAboutEmail = content.includes('email') || content.includes('@') || content.includes('dot com');
        const isAboutName = content.includes('full name') || content.includes('spelling that') || content.includes('spelled');

        // The confirmation either mentions claim/policy OR we're already in claim section and it's a readback
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

    // Check if user confirmed (must be after the agent's confirmation)
    if (msg.role === 'user' && agentConfirmation && i > confirmationIndex) {
      const c = content.trim();

      // Check for zero count corrections like "six zeros" or "five zeros"
      // User might say "Yes." then "six zeros. Yeah." to correct the agent
      // IMPORTANT: This should only match when it's a CORRECTION, not part of saying digits
      // "eight zero nine" = digits, "eight zeros" = correction (plural "zeros")
      // Also check that the message is SHORT (correction) not a full claim number statement
      const isShortMessage = content.length < 30;
      const zeroMatch = content.match(/\b(two|three|four|five|six|seven|eight|nine|ten)\s+zeros\b/i); // Must be plural "zeros"
      if (zeroMatch && isShortMessage) {
        const zeroCountMap = {
          'two': 2, 'three': 3, 'four': 4, 'five': 5,
          'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
        };
        userZeroCorrection = zeroCountMap[zeroMatch[1].toLowerCase()];
        userConfirmed = true;
        // Don't break - continue looking for more context
        continue;
      }

      if (c === 'yes' || c === 'yes.' || c === 'correct' || c === 'correct.' ||
          c === 'yeah' || c === 'yeah.' || c === 'yep' || c === 'yep.' ||
          c === 'alright' || c === 'alright.' || c === 'all right' || c === 'all right.' ||
          c.includes("that's right") || c.includes('thats right') ||
          c.startsWith('yes,') || c.startsWith('yeah,')) {
        userConfirmed = true;
        // Don't break immediately - continue to check for zero corrections in next message
        continue;
      }
      // If user says "incorrect", reset and keep looking
      if (content.includes('incorrect') || c === 'no' || c === 'no.') {
        agentConfirmation = null;
        confirmationIndex = -1;
        userZeroCorrection = null;
      }
    }

    // Stop processing when agent moves on to next topic
    if (msg.role === 'agent' && userConfirmed) {
      const movingOn = content.includes('what specifically') ||
                       content.includes('anything else') ||
                       content.includes('is there anything') ||
                       content.includes('how can i help') ||
                       content.includes('what can i help');
      if (movingOn) break;
    }
  }

  if (!agentConfirmation || !userConfirmed) {
    return null;
  }

  // Extract the number from the agent's confirmed readback
  let extracted = extractFromAgentReadback(agentConfirmation);

  // Apply user's zero count correction if provided
  // Example: Agent said "0 0 0 0 0 0 0" (7 zeros) but user corrected to "six zeros"
  if (userZeroCorrection && extracted) {
    // Find the LONGEST consecutive run of zeros (that's the one user is correcting)
    const zeroRuns = extracted.match(/0+/g) || [];
    const longestRun = zeroRuns.reduce((a, b) => a.length >= b.length ? a : b, '');

    if (longestRun.length > 0 && longestRun.length !== userZeroCorrection) {
      const currentZeros = longestRun.length;
      const correctZeros = '0'.repeat(userZeroCorrection);
      console.log(`   🔧 Applying user zero correction: ${currentZeros} zeros → ${userZeroCorrection} zeros`);
      // Replace the longest run of zeros with the correct count
      // Use a function to only replace the first occurrence of the longest run
      let replaced = false;
      extracted = extracted.replace(new RegExp(`0{${currentZeros}}`), () => {
        if (!replaced) {
          replaced = true;
          return correctZeros;
        }
        return longestRun;
      });
    }
  }

  // Validate
  if (!extracted || extracted.length < 5) {
    return null;
  }

  // Must contain at least one digit
  if (!/\d/.test(extracted)) {
    return null;
  }

  // Must be reasonable length
  if (extracted.length > 30) {
    return null;
  }

  return extracted;
}

/**
 * Programmatically convert spoken digit words to actual digits
 * This is more reliable than LLM for simple word-to-digit conversion
 *
 * IMPORTANT: This function should ONLY extract digits and valid claim number letters.
 * It should NOT pick up conversational words like "I", "can", "you", "me", etc.
 */
function convertSpokenToDigits(text) {
  const digitMap = {
    'zero': '0', 'oh': '0',
    'one': '1',
    'two': '2',
    'three': '3',
    'four': '4',
    'five': '5',
    'six': '6',
    'seven': '7',
    'eight': '8',
    'nine': '9'
  };

  // PHASE 1: Remove common filler phrases BEFORE word-by-word processing
  // These phrases use digit words but don't represent actual digits
  // "One second" = "please wait", NOT the digit 1
  // "One moment" = "please wait", NOT the digit 1
  let cleanedText = text;
  const fillerPhrases = [
    /\bone\s+second\b/gi,      // "one second" = please wait
    /\bone\s+moment\b/gi,      // "one moment" = please wait
    /\bjust\s+one\s+second\b/gi,
    /\bjust\s+one\s+moment\b/gi,
    /\bjust\s+a\s+second\b/gi,
    /\bjust\s+a\s+moment\b/gi,
    /\bgive\s+me\s+one\s+second\b/gi,
    /\bgive\s+me\s+one\s+moment\b/gi,
    /\bhold\s+on\s+one\s+second\b/gi,
    /\bwait\s+one\s+second\b/gi,
    /\bone\s+sec\b/gi,         // "one sec" = please wait
    /\btwo\s+seconds?\b/gi,    // "two seconds" = please wait
    /\bfive\s+seconds?\b/gi,   // "five seconds" = please wait
    /\bten\s+seconds?\b/gi,    // "ten seconds" = please wait
  ];

  for (const phrase of fillerPhrases) {
    cleanedText = cleanedText.replace(phrase, ' ');
  }

  // Common words that should NEVER be included in claim numbers
  // This prevents false positives like "781475IICANYOUME"
  const skipWords = new Set([
    // Confirmations and fillers
    'yes', 'yeah', 'yep', 'correct', 'right', 'the', 'is', 'its', 'it', 'and', 'a', 'an', 'um', 'uh', 'well', 'okay', 'ok',
    // Pronouns - critical to exclude
    'i', 'me', 'my', 'you', 'your', 'we', 'us', 'our', 'they', 'them', 'their', 'he', 'she', 'him', 'her', 'his',
    // Common verbs
    'can', 'could', 'will', 'would', 'do', 'does', 'did', 'have', 'has', 'had', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
    'get', 'got', 'go', 'going', 'went', 'come', 'came', 'see', 'saw', 'know', 'knew', 'think', 'thought', 'make', 'made',
    'say', 'said', 'take', 'took', 'give', 'gave', 'let', 'put', 'call', 'called', 'calling',
    // Common adjectives/adverbs
    'just', 'so', 'very', 'also', 'too', 'now', 'then', 'here', 'there', 'where', 'when', 'what', 'how', 'why', 'which', 'who',
    'this', 'that', 'these', 'those', 'all', 'some', 'any', 'no', 'not', 'more', 'most', 'other', 'same', 'new', 'old', 'good', 'bad',
    // Prepositions and conjunctions
    'in', 'on', 'at', 'by', 'from', 'with', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between',
    'under', 'over', 'out', 'up', 'down', 'off', 'but', 'or', 'if', 'because', 'as', 'of',
    // Phone/call related words
    'number', 'claim', 'file', 'case', 'policy', 'please', 'thank', 'thanks', 'sure', 'hold', 'moment', 'second', 'minute',
    // Misc common words
    'like', 'way', 'back', 'first', 'last', 'only', 'own', 'still', 'even', 'again', 'actually', 'really', 'probably',
    // Time-related words that often follow "one" but aren't claim digits
    'sec', 'min', 'hour', 'day', 'week', 'time'
  ]);

  // Split by whitespace and punctuation, keeping letters
  const words = cleanedText.split(/[\s.,!?;:]+/);
  let result = '';

  // Valid single letters that can appear in claim numbers (excluding 'i' which conflicts with pronoun)
  const validClaimLetters = new Set(['h', 'l', 'a', 'n', 'j', 'p', 'c', 'b', 'd', 'e', 'f', 'g', 'k', 'm', 'r', 's', 't', 'v', 'w', 'x', 'y', 'z']);

  // Valid state abbreviation prefixes
  const validPrefixes = new Set(['la', 'nj', 'ny', 'ca', 'tx', 'fl', 'pa', 'oh', 'il', 'ga', 'nc', 'mi', 'va', 'wa', 'ma', 'az', 'co', 'tn', 'md', 'mn', 'wi', 'mo', 'sc', 'al', 'ky', 'or', 'ok', 'ct', 'ia', 'ut', 'nv', 'ar', 'ms', 'ks', 'nm', 'ne', 'wv', 'id', 'hi', 'nh', 'me', 'ri', 'mt', 'de', 'sd', 'nd', 'ak', 'dc', 'vt', 'wy']);

  for (const word of words) {
    const lower = word.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Skip empty words
    if (!lower) {
      continue;
    }

    // Check if it's a digit word (zero, one, two, etc.) - HIGHEST PRIORITY
    if (digitMap[lower]) {
      result += digitMap[lower];
      continue;
    }

    // Check if it's already a digit
    if (/^\d+$/.test(lower)) {
      result += lower;
      continue;
    }

    // Check for SINGLE LETTERS that are valid in claim numbers
    // This must come BEFORE skipWords check because 'a' is both a skipWord AND a valid claim letter
    // When someone says "L A three five nine", the "A" is part of the claim number, not the article "a"
    if (/^[a-z]$/i.test(lower) && validClaimLetters.has(lower)) {
      result += lower.toUpperCase();
      continue;
    }

    // Check for 2-letter state abbreviation prefixes (LA, NJ, etc.)
    if (/^[a-z]{2}$/i.test(lower) && validPrefixes.has(lower)) {
      result += lower.toUpperCase();
      continue;
    }

    // Skip common filler words (for multi-letter non-prefix words)
    // This is checked LAST so single letters like 'a' are captured above
    if (skipWords.has(lower)) {
      continue;
    }
  }

  return result;
}

/**
 * Extract claim number using DETERMINISTIC programmatic extraction
 *
 * Strategy:
 * 1. First check if caller explicitly said they don't have a claim number - if so, return null
 * 2. Find the claim number exchange section of the transcript
 * 3. Find the USER's original statement with the claim number (not agent readback)
 * 4. Use simple word-to-digit conversion (zero->0, one->1, etc.)
 *
 * @param {Array} transcriptArray - Array of {role, content} messages
 * @returns {Promise<string|null>} - Extracted claim number or null
 */
async function extractClaimNumberWithSonnet(transcriptArray) {
  if (!Array.isArray(transcriptArray) || transcriptArray.length === 0) {
    return null;
  }

  // FIRST: Check if caller explicitly said they don't have a claim number
  if (callerSaidNoClaimNumber(transcriptArray)) {
    console.log('   ⏭️ Caller explicitly said no claim number - skipping extraction');
    return null;
  }

  // Find the claim number exchange section
  let claimExchangeStart = -1;
  let claimExchangeEnd = -1;

  for (let i = 0; i < transcriptArray.length; i++) {
    const msg = transcriptArray[i];
    const content = msg.content.toLowerCase();

    // Find where agent asks for claim number
    if (msg.role === 'agent' && claimExchangeStart === -1) {
      const isAskingForClaimNumber = (
        (content.includes('claim number') || content.includes('file number') || content.includes('case number') || content.includes('policy number')) &&
        (content.includes('?') || content.includes('what') || content.includes('provide') || content.includes('do you have') || content.includes('please'))
      );
      if (isAskingForClaimNumber) {
        claimExchangeStart = i;
      }
    }

    // Find where the claim number exchange ends (agent moves to next topic or call ends)
    if (claimExchangeStart !== -1 && msg.role === 'agent') {
      const isMovingOn = (
        content.includes('what specifically') ||
        content.includes('anything else') ||
        content.includes('is there anything') ||
        content.includes('thank you for calling') ||
        content.includes('have a good day') ||
        (content.includes('i will') && content.includes('attorney'))
      );
      if (isMovingOn) {
        claimExchangeEnd = i;
        break;
      }
    }
  }

  // If no claim exchange found, return null
  if (claimExchangeStart === -1) {
    return null;
  }

  // Default end to a few messages after start if not found
  if (claimExchangeEnd === -1) {
    claimExchangeEnd = Math.min(claimExchangeStart + 10, transcriptArray.length);
  }

  // Extract the claim exchange portion
  const claimExchange = transcriptArray.slice(claimExchangeStart, claimExchangeEnd);

  // Check if there's actually any number content in the exchange
  const exchangeText = claimExchange.map(m => m.content).join(' ');
  const hasNumberContent = /\d|zero|one|two|three|four|five|six|seven|eight|nine/i.test(exchangeText);

  if (!hasNumberContent) {
    return null;
  }

  // Find the USER's original claim number statement (not agent readback)
  // The user often says "Yes. Zero six seven..." - starting with Yes but containing the actual number
  let userClaimStatement = null;
  for (let i = 0; i < claimExchange.length; i++) {
    const msg = claimExchange[i];
    if (msg.role === 'user') {
      const content = msg.content;
      const contentLower = content.toLowerCase();

      // Count how many digit words are in the message (indicates actual claim number, not just confirmation)
      const digitWords = contentLower.match(/\b(zero|one|two|three|four|five|six|seven|eight|nine)\b/g) || [];
      const hasMultipleDigitWords = digitWords.length >= 5; // A real claim number has many digits

      // Skip pure confirmations (short messages that are just "yes", "correct", etc.)
      const isPureConfirmation = /^(yes|yeah|yep|correct|right|that's right|six zeros|okay)\.?$/i.test(content.trim());

      // Skip if this looks like a phone number (contains "extension" or was followed by phone confirmation)
      const isPhoneNumber = contentLower.includes('extension') ||
                           contentLower.includes('ext ') ||
                           contentLower.includes('ext.') ||
                           // Check if the previous agent message was asking for phone number
                           (i > 0 && claimExchange[i-1].role === 'agent' &&
                            (claimExchange[i-1].content.toLowerCase().includes('phone') ||
                             claimExchange[i-1].content.toLowerCase().includes('reach you') ||
                             claimExchange[i-1].content.toLowerCase().includes('best number')));

      if (hasMultipleDigitWords && !isPureConfirmation && !isPhoneNumber && content.length > 20) {
        userClaimStatement = content;
        break;
      }
    }
  }

  if (!userClaimStatement) {
    return null;
  }

  // Use DETERMINISTIC programmatic extraction
  const claimNumber = convertSpokenToDigits(userClaimStatement);

  // Validate the result
  if (!claimNumber || claimNumber.length < 5) {
    if (claimNumber && claimNumber.length > 0) {
      console.log(`   ⚠️ Rejected "${claimNumber}" (too short)`);
    }
    return null;
  }

  // Must contain at least one digit
  if (!/\d/.test(claimNumber)) {
    console.log(`   ⚠️ Rejected "${claimNumber}" (no digits)`);
    return null;
  }

  // Must be reasonable length
  if (claimNumber.length > 30) {
    console.log(`   ⚠️ Rejected claim number (too long: ${claimNumber.length} chars)`);
    return null;
  }

  console.log(`   ✅ Extracted claim number: ${claimNumber}`);
  return claimNumber;
}

/**
 * Extract ALL relevant fields from a call transcript based on caller type
 * @param {string} transcript - The call transcript (string or array of messages)
 * @param {string} category - Call category (New Lead, Attorney, Medical Professional, etc.)
 * @returns {object} Extracted data with all relevant fields
 */
async function extractAllCallData(transcript, category) {
  if (!transcript) {
    return null;
  }

  // Convert array transcript to string if needed
  let transcriptText = transcript;
  if (Array.isArray(transcript)) {
    transcriptText = transcript
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n');
  }

  if (!transcriptText || transcriptText.trim().length === 0) {
    return null;
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5-20251101', // Claude Opus 4.5 - maximum accuracy for data extraction
      max_tokens: 2000, // Increased for _thinking field
      temperature: 0, // Deterministic extraction
      messages: [{
        role: 'user',
        content: `You are extracting structured data from a phone call transcript for CourtLaw, a personal injury law firm's intake system.

Call Category: ${category}

Extract the following information from the transcript. Return ONLY valid JSON with no additional text.

⚠️ CRITICAL RULES - READ CAREFULLY:

1. ONLY extract data from THIS transcript. Do NOT use any external knowledge or make assumptions.
2. When in doubt, return null. It is MUCH better to return null than to guess or hallucinate.
3. You MUST include the "_thinking" field FIRST in your response - this is where you quote the exact transcript text that supports each extraction.

=== _thinking FIELD (REQUIRED) ===
Before extracting ANY value, you must quote the exact transcript text that verifies it.
Format your _thinking as:
{
  "_thinking": {
    "phone_verification": "Agent said: '[exact quote]' and caller confirmed '[exact quote]'",
    "email_verification": "Agent spelled back: '[exact quote]' and caller said '[exact quote]'",
    "claim_number_verification": "Agent read back: '[exact quote]' and caller confirmed '[exact quote]'",
    "name_verification": "Caller stated: '[exact quote]' or Agent confirmed: '[exact quote]'"
  }
}
If you cannot find a direct quote to support a field, set that field to null.

=== PHONE NUMBER EXTRACTION - CRITICAL ===
- Find the AGENT'S FINAL READBACK where they repeat the COMPLETE number back to the caller
- The agent combines the base number AND extension in their final confirmation
- Example: Agent says "eight eight eight, two seven nine, six three three six, extension one five one five" - extract ALL of it
- IMPORTANT: The extension may be spoken by the caller in a SEPARATE message - look for it across multiple turns
- Convert ALL spoken words to digits: "eight" → 8, "five" → 5, "zero" → 0, etc.
- Format: XXX-XXX-XXXX ext XXXX (if extension exists)
- If caller says "I don't have one" or refuses, return null

=== EMAIL EXTRACTION - CRITICAL ===
- ONLY extract if the AGENT SPELLS BACK the complete email letter-by-letter and caller CONFIRMS
- Use EXACTLY what the agent spelled - character by character
- Must be valid format: localpart@domain.tld
- Do NOT guess, autocorrect, or fill in missing parts
- If conversation is unclear or no confirmed spelling exists, return null

=== CLAIM/POLICY NUMBER EXTRACTION - CRITICAL ===
- Find where the AGENT reads back the number and CALLER confirms ("yes", "correct", etc.)
- Convert ALL spoken words to digits: "six eight one" → "681", "zero" → "0"
- If agent says "six zeros" that means exactly "000000" (6 zeros)
- PRESERVE the format as a STRING - keep any dashes or letters (e.g., "A31-B8960", "LA-123456")
- Leading zeros MUST be preserved (output as string, not number)
- Include letter prefixes exactly as stated (LA, NJ, A as in Adam, etc.)
- If caller says "incorrect" after a readback, find the NEXT readback they accept

=== NAME EXTRACTION ===
- If caller SPELLS their name letter-by-letter, use that EXACT spelling
- Include titles for professionals (Attorney, Dr., etc.)

=== CALL SUMMARY ===
Write a professional 3-5 sentence summary as if a human intake coordinator took the call.
CRITICAL: Do NOT mention AI, bots, automated systems, or any technical issues.
Write in past tense as if summarizing a call handled by an experienced legal intake specialist.

=== FIELDS TO EXTRACT ===

ALL CALLS:
- name: Full name of caller
- phone: VERBALLY PROVIDED callback number with extension (NOT inbound caller ID)
- email: CONFIRMED email from agent's spelling readback only
- purpose: Detailed reason for calling
- referral_source: How they heard about us (Google, TV, radio, referral, billboard, etc.)
- claim_number: Claim/case/file/policy number as a STRING (preserve dashes, letters, leading zeros)

ATTORNEY/MEDICAL/INSURANCE/OTHER:
- who_representing: Organization/firm/facility they represent
- case_name: Patient or client name they're calling about

NEW LEADS:
- incident_description: What happened (1-2 sentences)
- incident_date: YYYY-MM-DD format
- incident_location: City/address
- case_type: rideshare, car_accident, motorcycle, truck, bus, taxi, construction, slip_fall, workers_comp, medical_malpractice, or other

CASE-SPECIFIC (if mentioned):
Rideshare: rideshare_role, rideshare_service, rideshare_driver_info
Vehicle accidents: vehicle_type, fault_determination, police_report_filed, other_party_insured, injuries_sustained
Construction: construction_site_type, injury_cause, employer_name, safety_equipment
Slip & Fall: property_type, fall_cause, property_owner, witnesses_present
Workers Comp: employer_name, workplace_type, work_injury_type, injury_reported, doctor_visit

Transcript:
${transcriptText}

Return format (JSON only - _thinking MUST be first):
{
  "_thinking": {
    "phone_verification": "quote from transcript or 'not found'",
    "email_verification": "quote from transcript or 'not found'",
    "claim_number_verification": "quote from transcript or 'not found'",
    "name_verification": "quote from transcript or 'not found'"
  },
  "call_summary": "professional 3-5 sentence summary",
  "name": "string or null",
  "phone": "XXX-XXX-XXXX ext XXXX format or null",
  "email": "confirmed email or null",
  "purpose": "string or null",
  "referral_source": "string or null",
  "who_representing": "string or null",
  "case_name": "string or null",
  "claim_number": "string with dashes/letters preserved or null",
  "incident_description": "string or null",
  "incident_date": "YYYY-MM-DD or null",
  "incident_location": "string or null",
  "case_type": "string or null",
  "rideshare_role": "string or null",
  "rideshare_service": "string or null",
  "rideshare_driver_info": "string or null",
  "vehicle_type": "string or null",
  "fault_determination": "string or null",
  "police_report_filed": "string or null",
  "other_party_insured": "string or null",
  "injuries_sustained": "string or null",
  "construction_site_type": "string or null",
  "injury_cause": "string or null",
  "employer_name": "string or null",
  "safety_equipment": "string or null",
  "property_type": "string or null",
  "fall_cause": "string or null",
  "property_owner": "string or null",
  "witnesses_present": "string or null",
  "workplace_type": "string or null",
  "work_injury_type": "string or null",
  "injury_reported": "string or null",
  "doctor_visit": "string or null"
}`
      }]
    });

    const textContent = response.content.find(block => block.type === 'text');
    if (!textContent) {
      console.error('❌ No text content in AI response');
      return null;
    }

    // Parse the JSON response
    let extracted;
    try {
      // Try to parse the raw response
      extracted = JSON.parse(textContent.text);
    } catch (parseError) {
      // If that fails, try to extract JSON from markdown code blocks
      const jsonMatch = textContent.text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        extracted = JSON.parse(jsonMatch[1]);
      } else {
        throw parseError;
      }
    }

    // Log the _thinking field for debugging, then remove it from output
    if (extracted._thinking) {
      console.log(`   🧠 AI Verification:`);
      if (extracted._thinking.phone_verification && extracted._thinking.phone_verification !== 'not found') {
        console.log(`      Phone: ${extracted._thinking.phone_verification.substring(0, 100)}...`);
      }
      if (extracted._thinking.email_verification && extracted._thinking.email_verification !== 'not found') {
        console.log(`      Email: ${extracted._thinking.email_verification.substring(0, 100)}...`);
      }
      if (extracted._thinking.claim_number_verification && extracted._thinking.claim_number_verification !== 'not found') {
        console.log(`      Claim#: ${extracted._thinking.claim_number_verification.substring(0, 100)}...`);
      }
      // Remove _thinking from the output (not needed in notifications)
      delete extracted._thinking;
    }

    // Post-process: Clean up email addresses
    if (extracted.email && extracted.email !== 'null' && extracted.email !== null) {
      // Handle spelled-out emails like "john at company dot com"
      if (extracted.email.includes(' ') && !extracted.email.includes('@')) {
        // This looks like a spelled-out email, try to convert it
        let cleanEmail = extracted.email.toLowerCase()
          .replace(/\s+at\s+/g, '@')
          .replace(/\s+dot\s+/g, '.')
          .replace(/\s+/g, '');
        extracted.email = cleanEmail;
      }
    }

    // Post-process: Try to find email in transcript if not extracted
    // IMPORTANT: Exclude CourtLaw's own business emails (these are NOT caller emails)
    if (!extracted.email || extracted.email === 'null') {
      const emailMatch = transcriptText.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i);
      if (emailMatch) {
        const foundEmail = emailMatch[1].toLowerCase();
        // Exclude business/firm emails that Maria mentions as contact info
        const excludedEmails = [
          'info@courtlaw.com',
          'karzadi@courtlaw.com',
          'notifications@saveyatech.com'
        ];
        const excludedDomains = ['courtlaw.com', 'saveyatech.com', 'saveyatech.app'];
        const emailDomain = foundEmail.split('@')[1];

        if (!excludedEmails.includes(foundEmail) && !excludedDomains.includes(emailDomain)) {
          extracted.email = foundEmail;
        }
      }
    }

    // Convert string "null" to actual null
    Object.keys(extracted).forEach(key => {
      if (extracted[key] === 'null' || extracted[key] === '') {
        extracted[key] = null;
      }
    });

    // Post-process: Format phone number (allow extensions)
    if (extracted.phone) {
      // Extract extension first if present
      const extMatch = extracted.phone.match(/(?:ext\.?|extension|x)\s*(\d+)/i);
      const extension = extMatch ? extMatch[1] : null;

      // Extract only digits from the base number (before extension)
      const basePhone = extMatch ? extracted.phone.substring(0, extMatch.index) : extracted.phone;
      const phoneDigits = basePhone.replace(/\D/g, '');

      // US phone numbers should have 10 digits (or 11 if starts with 1)
      const validLength = phoneDigits.length === 10 || (phoneDigits.length === 11 && phoneDigits.startsWith('1'));
      if (validLength) {
        // Format as XXX-XXX-XXXX
        const baseDigits = phoneDigits.length === 11 ? phoneDigits.slice(1) : phoneDigits;
        extracted.phone = `${baseDigits.slice(0,3)}-${baseDigits.slice(3,6)}-${baseDigits.slice(6)}`;
        if (extension) {
          extracted.phone += ` ext ${extension}`;
        }
      }
      // If not valid length, keep whatever was extracted (don't reject)
    }

    // No email validation - just extract what was spoken

    // Post-process: Validate claim numbers from Haiku extraction
    // - Must be at least 5 characters (short strings like "IA2" are likely false positives)
    // - Must contain at least one digit (pure letter strings are likely names)
    if (extracted.claim_number) {
      const claimNum = extracted.claim_number;
      const hasDigit = /\d/.test(claimNum);
      if (claimNum.length < 5 || !hasDigit) {
        const reason = claimNum.length < 5 ? 'too short' : 'no digits';
        console.log(`   ⚠️ Rejected Haiku claim number "${claimNum}" (${reason})`);
        extracted.claim_number = null;
      }
    }

    // Post-process claim number extraction:
    // Strategy: Use deterministic extraction from agent's CONFIRMED readback (what user said "yes" to)
    // This is more reliable than AI extraction because we're reading the literal digits the agent read back.
    // Fallback to Haiku's extraction if no confirmed readback found.
    if (Array.isArray(transcript)) {
      // PRIMARY: Extract from agent's confirmed readback (deterministic, no AI)
      const confirmedClaimNumber = extractClaimNumberFromConfirmedReadback(transcript);
      if (confirmedClaimNumber) {
        extracted.claim_number = confirmedClaimNumber;
        console.log(`   ✅ Extracted claim number (from confirmed readback): ${extracted.claim_number}`);
      } else if (extracted.claim_number && extracted.claim_number.length >= 5 && /\d/.test(extracted.claim_number)) {
        // FALLBACK 1: Use Haiku's extraction if valid
        extracted.claim_number = extracted.claim_number.replace(/[-\s]/g, '');
        console.log(`   ✅ Extracted claim number (from Haiku): ${extracted.claim_number}`);
      } else {
        // FALLBACK 2: Try programmatic extraction from user's spoken words
        const programmaticClaimNumber = await extractClaimNumberWithSonnet(transcript);
        if (programmaticClaimNumber) {
          console.log(`   ✅ Extracted claim number (from user statement): ${programmaticClaimNumber}`);
          extracted.claim_number = programmaticClaimNumber;
        }
      }
    }

    console.log(`   ✅ Extracted data from transcript for ${category}`);
    return extracted;

  } catch (error) {
    console.error('❌ Error extracting call data from transcript:', error.message);
    console.error('   Response:', error.response?.data || 'No response data');
    return null;
  }
}

module.exports = {
  extractAllCallData
};

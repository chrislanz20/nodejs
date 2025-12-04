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
      model: 'claude-3-5-haiku-20241022', // Fast and cost-effective
      max_tokens: 1500, // Increased for case-specific fields
      temperature: 0, // Deterministic extraction
      messages: [{
        role: 'user',
        content: `You are extracting structured data from a phone call transcript for CourtLaw, a personal injury law firm's intake system.

Call Category: ${category}

Extract the following information from the transcript. Return ONLY valid JSON with no additional text.

IMPORTANT EXTRACTION RULES:

⚠️ CRITICAL: When in doubt, return null. It is MUCH better to return null than to guess or hallucinate a value. Inaccurate data causes real problems.

1. For email addresses - CRITICAL ACCURACY REQUIRED:
   - ONLY extract if the AGENT SPELLS BACK the complete email and the caller CONFIRMS it
   - Use EXACTLY the letters the agent spells back, character by character
   - The email MUST be a valid format: localpart@domain.tld
   - Do NOT guess or autocorrect domain names - use exactly what was spelled
   - If the conversation is garbled, unclear, or the caller speaks another language, return null
   - If the caller says things like "sobre email" (Spanish) or unclear phrases, return null
   - If no complete confirmed email spelling exists, return null

2. For phone numbers - CRITICAL ACCURACY REQUIRED:
   - The phone number MUST be exactly 10 digits (US format) plus optional extension
   - Look for the AGENT'S READBACK that the caller CONFIRMS
   - Convert spoken digits: "nine one seven" → 917, "four two three" → 423, etc.
   - The final number MUST have exactly 10 digits before any extension
   - If the digits don't add up to exactly 10, return null (the input was garbled)
   - Include extensions if mentioned (e.g., "484-823-9264 ext 1510")
   - If caller says "I don't have one" or refuses to provide, return null
   - If no clear phone number exchange occurs, return null
   - Format as: XXX-XXX-XXXX (e.g., "484-823-9264")
3. For claim numbers / file numbers - CRITICAL ACCURACY REQUIRED:
   - Find where the AGENT reads back the claim number and the CALLER confirms it (says "yes", "correct", etc.)
   - USE THE AGENT'S FINAL CONFIRMED READBACK - this is the most accurate source
   - The agent typically reads it digit-by-digit like "8 7 9 6 5 9 6 6 1 0 0 0 0 0 0 1" - just combine those digits
   - Remove any dashes/spaces - output should be continuous digits/letters only
   - If agent says "then six zeros" or similar, that means exactly 6 zeros: 000000
   - Include letter prefixes (like "LA" or "NJ") exactly as stated
   - CRITICAL: Count the digits in the agent's readback EXACTLY - do not add or remove any
   - If caller says "incorrect" after a readback, find the NEXT confirmation that caller accepts
4. For names - IMPORTANT: If the caller SPELLS OUT their name letter-by-letter (e.g., "S-M-I-T-H" or "S as in Sam, M as in Mary..."), use that EXACT spelling. This is the most accurate source. Otherwise, use the name as spoken. Include title if attorney (e.g., "Attorney John Smith")
5. For purpose - extract the DETAILED reason they called (what they need, what they're asking for)
6. For case-specific fields - extract as much detail as possible about the type of incident
7. Use null if a field is truly not mentioned in the conversation

=== CALL SUMMARY (for email/SMS notifications) ===
- call_summary: Write a professional 3-5 sentence summary as if a human intake coordinator took the call. Include:
  • Who called and their relationship to the case (caller name, whether calling for themselves or someone else)
  • Key details about the incident/matter (what happened, when, injuries if applicable)
  • What information was collected (contact details, case specifics)
  • What action was taken or next steps (callback scheduled, attorney review, etc.)

  CRITICAL FILTERING RULES - Do NOT include ANY of the following:
  • Caller frustration, confusion, or complaints about the phone system
  • References to "AI", "bot", "automated system", "robot", or "virtual assistant"
  • Caller asking to speak to a "real person", "human", or "live agent"
  • Technical issues, call quality problems, or misunderstandings during the call
  • Any indication the call was handled by anything other than a professional intake coordinator

  Write in past tense, professionally, as if summarizing a call handled by an experienced legal intake specialist.

=== FIELDS FOR ALL CALLS ===
- name: Full name of the caller (with title if attorney/doctor)
- phone: CALLBACK phone number the caller VERBALLY PROVIDED during the call (NOT the inbound caller ID). Must be a number the caller spoke out loud. Return null if they didn't provide one or said "I don't have one".
- email: Email address that the AGENT SPELLED BACK and caller CONFIRMED. Use exact spelling from agent's readback. Return null if not confirmed.
- purpose: DETAILED reason for calling (be specific - what do they need?)
- referral_source: How did they hear about us? (Google, TV ad, radio, friend/family referral, billboard, social media, attorney referral, etc.) - IMPORTANT for marketing tracking
- claim_number: Any claim/case/file number mentioned - extract for ALL callers, especially Existing Clients (null if not mentioned)

=== FIELDS FOR ATTORNEY/MEDICAL/INSURANCE/OTHER CALLS ===
- who_representing: Organization/firm/facility they represent (null if not applicable)
- case_name: Patient name or client name they're calling about (null if not mentioned)

=== FIELDS FOR NEW LEAD CALLS ===
Base fields (for ALL new leads):
- incident_description: What happened (1-2 sentences, be specific)
- incident_date: Date of incident (YYYY-MM-DD format, null if not mentioned)
- incident_location: Where incident occurred (city/address, null if not mentioned)
- case_type: Type of case - one of: rideshare, car_accident, motorcycle, truck, bus, taxi, construction, slip_fall, workers_comp, medical_malpractice, other

Case-Specific Fields (extract if mentioned):

FOR RIDESHARE CASES (Uber/Lyft):
- rideshare_role: Was caller the passenger, driver, or hit by rideshare vehicle?
- rideshare_service: Which service? (Uber, Lyft, other)
- rideshare_driver_info: Driver name or vehicle info if mentioned

FOR CAR/MOTORCYCLE/TRUCK/BUS/TAXI ACCIDENTS:
- vehicle_type: What type of vehicle was caller in/driving?
- fault_determination: Who was at fault? (caller, other party, unclear)
- police_report_filed: Was a police report filed? (yes, no, unknown)
- other_party_insured: Is other driver insured? (yes, no, unknown)
- injuries_sustained: Specific injuries mentioned (concise list)

FOR CONSTRUCTION ACCIDENTS:
- construction_site_type: Type of site (commercial, residential, road work, etc.)
- injury_cause: What caused the injury? (fall, equipment, debris, etc.)
- employer_name: Who do they work for?
- safety_equipment: Was safety equipment provided/used?

FOR SLIP & FALL:
- property_type: Where did it happen? (store, restaurant, sidewalk, etc.)
- fall_cause: What caused the fall? (wet floor, ice, uneven surface, etc.)
- property_owner: Who owns the property if mentioned?
- witnesses_present: Were there witnesses? (yes, no, unknown)

FOR WORKERS' COMPENSATION:
- employer_name: Who do they work for?
- workplace_type: Type of workplace (construction, office, warehouse, etc.)
- work_injury_type: What type of injury at work?
- injury_reported: Did they report it to employer? (yes, no)
- doctor_visit: Have they seen a doctor? (yes, no, scheduled)

Transcript:
${transcriptText}

Return format (JSON only, include all fields even if null):
{
  "call_summary": "professional 3-5 sentence summary (REQUIRED - never null)",
  "name": "string or null",
  "phone": "VERBALLY PROVIDED callback number only (NOT inbound caller ID) - null if not provided",
  "email": "CONFIRMED email from agent's spelling readback only - null if not confirmed",
  "purpose": "detailed string or null",
  "referral_source": "string or null (Google, TV, Radio, Referral, Billboard, Social Media, etc.)",
  "who_representing": "string or null",
  "case_name": "string or null",
  "claim_number": "string or null",
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

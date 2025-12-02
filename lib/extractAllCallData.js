// Extract structured data from ALL call types using AI
// Works for: New Leads, Attorneys, Medical Professionals, Insurance, Other callers
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 30000, // 30 seconds - prevents hanging on slow API calls
  maxRetries: 2   // Retry twice on failure
});

/**
 * Convert spoken digit words to actual digits
 * This is used instead of AI for claim numbers because LLMs can't reliably count
 * repeated digits like "zero zero zero zero zero zero"
 */
const WORD_TO_DIGIT = {
  'zero': '0', 'oh': '0',
  'one': '1', 'two': '2', 'three': '3', 'four': '4',
  'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
  'dash': '-', 'hyphen': '-'
};

// Note: Single letters (for alphanumeric claim numbers like "LA3590525...")
// are handled specially in convertSpokenToDigits() - only at the START of a number
// We don't add them to WORD_TO_DIGIT to avoid matching "I" in "Did I get that right"

/**
 * Convert a spoken number string to digits programmatically
 * Handles:
 * - Spoken words: "eight seven nine" → "879"
 * - Digit characters: "8 7 9" → "879"
 * - Mixed: "l a three five" → "LA35"
 * - Count patterns: "six zeros" → "000000" (6 zeros, not the digit 6)
 * - Duplicate patterns: "six zeros—0 0 0 0 0 0" → just 6 zeros (not 12)
 * @param {string} spokenText - Text like "eight seven nine five zero one"
 * @returns {string} - Converted digits like "879501"
 */
function convertSpokenToDigits(spokenText) {
  if (!spokenText) return '';

  let text = spokenText.toLowerCase();

  // If the text contains "file number is" or "claim number is", extract only the part after
  const numberIntro = text.match(/(?:file|claim|case)\s*number\s*(?:is\s*)?(.*)/i);
  if (numberIntro) {
    text = numberIntro[1];
  }

  // Handle patterns like "six zeros—0 0 0 0 0 0" where the em-dash part duplicates the zeros
  // Remove the explicit digit repetition after count patterns to avoid double-counting
  text = text.replace(/(one|two|three|four|five|six|seven|eight|nine|ten)\s+zeros?[—–-][0-9\s]+/gi, (match, count) => {
    return count + ' zeros';
  });

  // Handle NATO phonetic alphabet patterns like "L as in Larry, A as in Apple"
  // Convert these to just the letter
  text = text.replace(/([a-z])\s+as\s+in\s+[a-z]+/gi, '$1');

  // Replace em-dashes, en-dashes, and other punctuation with spaces
  text = text.replace(/[—–,\.!?]/g, ' ');

  // Split on whitespace
  const tokens = text.split(/\s+/).filter(t => t.length > 0);

  // First pass: collect all potential number parts
  const parts = [];
  let hasLetterPrefix = false;

  // Words that indicate a count, not a digit (e.g., "six zeros" means 6 zeros, not digit 6)
  const countWords = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const cleanToken = token.replace(/[^a-z]/g, '');

    // Check if this is a count pattern like "six zeros" or "then six zeros"
    // Look ahead to see if next token is "zeros" or "0s" or similar
    const nextToken = tokens[i + 1] ? tokens[i + 1].replace(/[^a-z0]/g, '') : '';
    if (countWords[cleanToken] && (nextToken === 'zeros' || nextToken === '0s' || nextToken === 'zeroes')) {
      // This is a count - add that many zeros
      const count = countWords[cleanToken];
      for (let j = 0; j < count; j++) {
        parts.push('0');
      }
      i++; // Skip the "zeros" token
      continue;
    }

    // Single digit character
    if (/^[0-9]$/.test(token)) {
      parts.push(token);
      continue;
    }

    // Check if we've started collecting digits yet
    const hasDigitsYet = parts.some(p => /[0-9]/.test(p));

    // Single letter handling - for alphanumeric claim numbers like "L A three five..."
    // Only allow letters at the very beginning before any digits
    if (/^[a-z]$/.test(cleanToken) && !hasDigitsYet) {
      // Check if next token is also a letter or digit - confirms it's part of the number
      const nextClean = nextToken ? nextToken.replace(/[^a-z0-9]/g, '') : '';
      if (nextClean && (/^[a-z0-9]$/.test(nextClean) || WORD_TO_DIGIT[nextClean])) {
        hasLetterPrefix = true;
        parts.push(cleanToken.toUpperCase());
        continue;
      }
    }

    // Skip the word "a" ONLY when it appears after digits (as in "ends with a 1")
    // Don't skip "a" at the start - it could be part of "L A" prefix
    if (cleanToken === 'a' && hasDigitsYet) {
      continue;
    }

    // Digit word (zero, one, two, etc.)
    const digit = WORD_TO_DIGIT[cleanToken];
    if (digit !== undefined) {
      parts.push(digit);
      continue;
    }

    // If we've collected parts and hit a non-number, check if we should stop or continue
    if (parts.length > 0) {
      // STOP words - these indicate we've moved past the claim number to other info
      // (e.g., "claim number X, and your contact is Y")
      const stopWords = ['your', 'contact', 'phone', 'email', 'direct', 'reach', 'call'];
      if (stopWords.includes(cleanToken)) {
        break;
      }

      // Skip filler words that appear within claim numbers
      const skipWords = ['then', 'and', 'followed', 'by', 'it', 'ends', 'with'];
      if (skipWords.includes(cleanToken)) {
        continue;
      }
      // "zeros" without a preceding count - skip it
      if (cleanToken === 'zeros' || cleanToken === 'zeroes') {
        continue;
      }
      // Stop at other words (but not if we're in the middle of a number pattern)
      // Check if there are more digits coming after this word
      let hasMoreDigits = false;
      for (let j = i + 1; j < Math.min(i + 4, tokens.length); j++) {
        const futureToken = tokens[j].replace(/[^a-z0-9]/g, '');
        if (/^[0-9]$/.test(futureToken) || WORD_TO_DIGIT[futureToken] !== undefined) {
          hasMoreDigits = true;
          break;
        }
      }
      if (!hasMoreDigits) {
        break;
      }
    }
  }

  return parts.join('');
}

/**
 * Check if a user message is a confirmation (yes, correct, etc.)
 */
function isConfirmation(text) {
  const confirmWords = ['yes', 'yeah', 'yep', 'correct', 'right', 'that\'s right', 'thats right', 'perfect'];
  const lower = text.toLowerCase().trim();
  return confirmWords.some(word => lower === word || lower.startsWith(word + '.') || lower.startsWith(word + ',') || lower.startsWith(word + ' '));
}

/**
 * Check if a user message indicates rejection/correction
 */
function isRejection(text) {
  const rejectWords = ['no', 'incorrect', 'wrong', 'not correct', 'nope'];
  const lower = text.toLowerCase().trim();
  return rejectWords.some(word => lower === word || lower.startsWith(word + '.') || lower.startsWith(word + ',') || lower.startsWith(word + ' '));
}

/**
 * Extract claim number from transcript using programmatic digit conversion
 * Finds the LAST CONFIRMED claim number - handles corrections.
 *
 * Strategy: Look for ALL agent read-backs with user confirmations,
 * and use the LAST one that was confirmed (in case user corrected earlier version)
 *
 * @param {Array} transcriptArray - Array of {role, content} messages
 * @returns {string|null} - Extracted claim number or null
 */
function extractClaimNumberProgrammatically(transcriptArray) {
  if (!Array.isArray(transcriptArray) || transcriptArray.length === 0) {
    return null;
  }

  let lastConfirmedNumber = null;
  let fallbackNumber = null;  // In case nothing is confirmed

  for (let i = 0; i < transcriptArray.length; i++) {
    const msg = transcriptArray[i];

    // Look for agent messages about claim/file number
    if (msg.role === 'agent') {
      const content = msg.content.toLowerCase();

      // Check if agent is reading back/confirming a claim number
      const isReadingBack = (
        (content.includes('claim number') || content.includes('file number')) &&
        (content.includes('is that correct') ||
         content.includes('did i get') ||
         content.includes('does that sound') ||
         content.includes('let me read') ||
         content.includes('make sure') ||
         content.includes('to confirm') ||
         content.includes('just to be sure'))
      );

      if (isReadingBack) {
        // Extract the number from agent's read-back
        const readBack = convertSpokenToDigits(msg.content);

        // Check user's response
        if (i + 1 < transcriptArray.length && transcriptArray[i + 1].role === 'user') {
          const userResponse = transcriptArray[i + 1].content;

          if (isConfirmation(userResponse)) {
            // User confirmed - this is now the best candidate
            if (readBack && readBack.length >= 3) {
              lastConfirmedNumber = readBack;
            }
          }
          // If rejection, don't use this number - look for next one
        }
      }

      // Also check if agent is asking for claim number (to get fallback)
      const isAskingForClaimNumber = (
        (content.includes('claim number') || content.includes('file number') || content.includes('case number')) &&
        (content.includes('?') || content.includes('what') || content.includes('provide') || content.includes('do you have') || content.includes('please'))
      );

      if (isAskingForClaimNumber && !fallbackNumber) {
        // Check next user message for the number as fallback
        if (i + 1 < transcriptArray.length && transcriptArray[i + 1].role === 'user') {
          const userResponse = transcriptArray[i + 1].content;
          const converted = convertSpokenToDigits(userResponse);
          if (converted && converted.length >= 3) {
            fallbackNumber = converted;
          }
        }
      }
    }
  }

  // Prefer last confirmed number, otherwise use fallback
  return lastConfirmedNumber || fallbackNumber;
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
1. For email addresses - look for spelling like "m at company dot com" or "mary.jones@company.com"
2. For phone numbers - CRITICAL ACCURACY REQUIRED:
   - Look for when the AGENT READS BACK the phone number and the caller CONFIRMS it (says "yes", "correct", "yep", "that's right")
   - The CONFIRMED/READ-BACK version is the most accurate - ALWAYS use it over the initial spoken version
   - STEP-BY-STEP PROCESS for converting spoken digits:
     a) Find where the agent says "Let me read that back" or "let me make sure I have that right"
     b) Extract the digits the agent reads: "four eight four... eight two three... nine two six four"
     c) Convert each word: four=4, eight=8, four=4, eight=8, two=2, three=3, nine=9, two=2, six=6, four=4
     d) Combine: "4848239264"
   - Format as: XXX-XXX-XXXX (e.g., "484-823-9264")
   - If no confirmation, use the caller's original spoken number with the same digit conversion process
3. For claim numbers / file numbers - CRITICAL ACCURACY REQUIRED:
   - Look for any mention of "claim", "case number", "file number", "claim number", etc.
   - STEP-BY-STEP PROCESS for converting spoken digits:
     a) First, write out each spoken word on a separate line
     b) Convert each word to its digit (zero=0, one=1, two=2, three=3, four=4, five=5, six=6, seven=7, eight=8, nine=9)
     c) Count the total number of digits
     d) Combine them into the final number
   - EXAMPLE: "three five nine zero zero five" becomes:
     three = 3
     five = 5
     nine = 9
     zero = 0
     zero = 0
     five = 5
     Total: 6 digits → "359005"
   - CRITICAL: "zero zero zero zero" = exactly 4 zeros (0000), NOT 5
   - CRITICAL: "zero zero zero zero five" = 00005 (5 digits total)
   - Include any letter prefixes (like "LA" or "NJ") exactly as stated
   - If the agent confirms/reads back the number and caller says "yes", use that confirmed version
   - The FINAL digit count MUST EXACTLY match the number of spoken digit words
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
- phone: Phone number they provided verbally
- email: Email address (null if not provided)
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
  "phone": "string or null",
  "email": "string or null",
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

    // Post-process: Fix claim numbers using programmatic extraction
    // LLMs can't reliably count repeated digits like "zero zero zero zero"
    // so we extract claim numbers programmatically from the transcript
    if (Array.isArray(transcript)) {
      const programmaticClaimNumber = extractClaimNumberProgrammatically(transcript);
      if (programmaticClaimNumber) {
        if (extracted.claim_number && extracted.claim_number !== programmaticClaimNumber) {
          console.log(`   🔧 Corrected claim number: "${extracted.claim_number}" → "${programmaticClaimNumber}"`);
        }
        extracted.claim_number = programmaticClaimNumber;
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

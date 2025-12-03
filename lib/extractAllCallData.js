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

  for (const word of words) {
    const lower = word.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Skip empty words and common filler words
    if (!lower || skipWords.has(lower)) {
      continue;
    }

    // Check if it's a digit word (zero, one, two, etc.)
    if (digitMap[lower]) {
      result += digitMap[lower];
    }
    // Check if it's already a digit
    else if (/^\d+$/.test(lower)) {
      result += lower;
    }
    // ONLY accept single letters that are commonly used in claim number prefixes
    // H is common (like 3050H398H), as well as state abbreviations
    // But we should NOT pick up pronouns like "I"
    else if (/^[a-z]$/i.test(lower)) {
      // Only accept letters that are explicitly spoken as part of claim number context
      // Look for patterns like "H as in hotel" or just standalone "H" after digits
      // For now, only accept H, L, A, N, J, P, C which are common in claim numbers
      // Exclude I (too commonly confused with pronoun "I")
      const validClaimLetters = ['h', 'l', 'a', 'n', 'j', 'p', 'c', 'b', 'd', 'e', 'f', 'g', 'k', 'm', 'r', 's', 't', 'v', 'w', 'x', 'y', 'z'];
      if (validClaimLetters.includes(lower) && lower !== 'i') {
        result += lower.toUpperCase();
      }
    }
    // Check if it's a state abbreviation prefix like "LA" or "NJ" (2 letters only)
    // But NOT common 2-letter words like "me", "be", "so", "if", "or", "an", "as", "at", "by", "do", "go", "he", "in", "is", "it", "my", "no", "of", "on", "to", "up", "us", "we"
    else if (/^[a-z]{2}$/i.test(lower)) {
      const validPrefixes = ['la', 'nj', 'ny', 'ca', 'tx', 'fl', 'pa', 'oh', 'il', 'ga', 'nc', 'mi', 'va', 'wa', 'ma', 'az', 'co', 'tn', 'md', 'mn', 'wi', 'mo', 'sc', 'al', 'ky', 'or', 'ok', 'ct', 'ia', 'ut', 'nv', 'ar', 'ms', 'ks', 'nm', 'ne', 'wv', 'id', 'hi', 'nh', 'me', 'ri', 'mt', 'de', 'sd', 'nd', 'ak', 'dc', 'vt', 'wy'];
      if (validPrefixes.includes(lower)) {
        result += lower.toUpperCase();
      }
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
  for (const msg of claimExchange) {
    if (msg.role === 'user') {
      const content = msg.content;

      // Count how many digit words are in the message (indicates actual claim number, not just confirmation)
      const digitWords = content.toLowerCase().match(/\b(zero|one|two|three|four|five|six|seven|eight|nine)\b/g) || [];
      const hasMultipleDigitWords = digitWords.length >= 5; // A real claim number has many digits

      // Skip pure confirmations (short messages that are just "yes", "correct", etc.)
      const isPureConfirmation = /^(yes|yeah|yep|correct|right|that's right|six zeros|okay)\.?$/i.test(content.trim());

      if (hasMultipleDigitWords && !isPureConfirmation && content.length > 20) {
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

    // Post-process: Extract claim numbers using Claude Sonnet 4 for high accuracy
    // Uses the CONFIRMED claim number from the transcript (agent reads back, user confirms)
    if (Array.isArray(transcript)) {
      const sonnetClaimNumber = await extractClaimNumberWithSonnet(transcript);
      if (sonnetClaimNumber) {
        if (extracted.claim_number && extracted.claim_number !== sonnetClaimNumber) {
          console.log(`   🔧 Corrected claim number: "${extracted.claim_number}" → "${sonnetClaimNumber}"`);
        }
        extracted.claim_number = sonnetClaimNumber;
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

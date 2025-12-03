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
 * Extract claim number using Claude Sonnet 4 for high accuracy
 *
 * Strategy:
 * 1. Find ALL claim number exchanges in the transcript
 * 2. Identify the LAST CONFIRMED claim number (agent reads back, user confirms)
 * 3. Use the USER's clear digit-by-digit statement (most reliable)
 * 4. Send to Claude Sonnet 4 for accurate conversion
 *
 * @param {Array} transcriptArray - Array of {role, content} messages
 * @returns {Promise<string|null>} - Extracted claim number or null
 */
async function extractClaimNumberWithSonnet(transcriptArray) {
  if (!Array.isArray(transcriptArray) || transcriptArray.length === 0) {
    return null;
  }

  // Find the best claim number statement to extract from
  let bestUserStatement = null;
  let lastConfirmedExchange = null;

  for (let i = 0; i < transcriptArray.length; i++) {
    const msg = transcriptArray[i];

    if (msg.role === 'agent') {
      const content = msg.content.toLowerCase();

      // Check if agent is asking for claim number
      const isAskingForClaimNumber = (
        (content.includes('claim number') || content.includes('file number') || content.includes('case number')) &&
        (content.includes('?') || content.includes('what') || content.includes('provide') || content.includes('do you have') || content.includes('please'))
      );

      // Check if agent is reading back/confirming
      const isReadingBack = (
        (content.includes('claim number') || content.includes('file number')) &&
        (content.includes('is that correct') ||
         content.includes('did i get') ||
         content.includes('does that sound') ||
         content.includes('is that right') ||
         content.includes('let me read') ||
         content.includes('let me confirm') ||
         content.includes('make sure') ||
         content.includes('to confirm') ||
         content.includes('just to be sure') ||
         content.includes('just to make sure'))
      );

      // Also check if agent is acknowledging with "Got it, the claim number is..."
      // This is an implicit confirmation that the agent heard correctly
      const isAcknowledging = (
        (content.includes('got it') || content.includes('okay') || content.includes('thank you')) &&
        (content.includes('claim number is') || content.includes('file number is'))
      );

      // If agent asks for claim number, capture the user's response
      if (isAskingForClaimNumber && i + 1 < transcriptArray.length) {
        const userResponse = transcriptArray[i + 1];
        if (userResponse.role === 'user') {
          // Check if user actually provided a number (not "I don't have it")
          const hasNumber = /\d|zero|one|two|three|four|five|six|seven|eight|nine/i.test(userResponse.content);
          const isRefusal = /don't have|do not have|i don't|no claim/i.test(userResponse.content.toLowerCase());
          if (hasNumber && !isRefusal) {
            bestUserStatement = userResponse.content;
          }
        }
      }

      // If agent reads back and user confirms, this is the gold standard
      // Use the USER's digit-by-digit statement (most reliable for extraction)
      if (isReadingBack && i + 1 < transcriptArray.length) {
        const userResponse = transcriptArray[i + 1];
        if (userResponse.role === 'user' && isConfirmation(userResponse.content)) {
          // Find the user's original statement before this readback
          // Look backwards to find when user provided the number
          for (let j = i - 1; j >= 0; j--) {
            if (transcriptArray[j].role === 'user') {
              const hasNumber = /\d|zero|one|two|three|four|five|six|seven|eight|nine/i.test(transcriptArray[j].content);
              const isRefusal = /don't have|do not have|i don't|no claim/i.test(transcriptArray[j].content.toLowerCase());
              if (hasNumber && !isRefusal) {
                lastConfirmedExchange = {
                  userStatement: transcriptArray[j].content,
                  agentReadback: msg.content,
                  confirmed: true,
                  useAgentReadback: false  // User confirmed, use user's clear digit-by-digit statement
                };
                break;
              }
            }
          }
        }
      }

      // If agent acknowledges with "Got it, the claim number is..." WITHOUT asking for confirmation
      // Use the AGENT's readback since user didn't have a chance to confirm
      if (isAcknowledging && !isReadingBack) {
        // Find the user's original statement before this acknowledgment
        for (let j = i - 1; j >= 0; j--) {
          if (transcriptArray[j].role === 'user') {
            const hasNumber = /\d|zero|one|two|three|four|five|six|seven|eight|nine/i.test(transcriptArray[j].content);
            const isRefusal = /don't have|do not have|i don't|no claim/i.test(transcriptArray[j].content.toLowerCase());
            if (hasNumber && !isRefusal) {
              // Use the AGENT's acknowledgment readback since there was no explicit confirmation
              lastConfirmedExchange = {
                userStatement: transcriptArray[j].content,
                agentReadback: msg.content,
                confirmed: true,
                useAgentReadback: true  // No user confirmation, use agent's clean readback
              };
              break;
            }
          }
        }
      }
    }
  }

  // Determine what to send to Sonnet 4
  let textToExtract = null;

  if (lastConfirmedExchange) {
    if (lastConfirmedExchange.useAgentReadback) {
      // Agent acknowledged with readback - use agent's version (most accurate)
      textToExtract = lastConfirmedExchange.agentReadback;
      console.log('   📋 Using agent\'s confirmed readback (most accurate)');
    } else {
      // User explicitly confirmed - use user's clear statement
      textToExtract = lastConfirmedExchange.userStatement;
      console.log('   📋 Using confirmed claim number from user statement');
    }
  } else if (bestUserStatement) {
    // Fallback: use the user's statement even without explicit confirmation
    textToExtract = bestUserStatement;
    console.log('   📋 Using unconfirmed claim number from user statement');
  }

  if (!textToExtract) {
    return null;
  }

  // Use Claude Sonnet 4 to extract the claim number accurately
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      temperature: 0,
      messages: [{
        role: 'user',
        content: `Convert this spoken claim/file number to written form.

Rules:
- Convert spoken digits: zero=0, one=1, two=2, three=3, four=4, five=5, six=6, seven=7, eight=8, nine=9
- "six zeros" or "6 zeros" = 000000 (six 0s), "five zeros" = 00000, etc.
- Keep letters as uppercase (H, L, A, etc.)
- Keep dashes only if speaker says "dash" or "hyphen"
- Ignore filler words and punctuation

Spoken: "${textToExtract}"

Output ONLY the claim number (no explanation):`
      }]
    });

    const result = response.content[0].text.trim();

    // Validate the result looks like a claim number (has digits/letters, reasonable length)
    if (result && result.length >= 3 && result.length <= 30 && /^[A-Z0-9-]+$/i.test(result)) {
      console.log(`   ✅ Sonnet 4 extracted claim number: ${result}`);
      return result.toUpperCase();
    } else {
      console.log(`   ⚠️ Sonnet 4 returned invalid result: "${result}"`);
      return null;
    }
  } catch (error) {
    console.error('   ❌ Error extracting claim number with Sonnet 4:', error.message);
    return null;
  }
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

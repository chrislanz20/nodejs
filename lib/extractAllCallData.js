// Extract structured data from ALL call types using AI
// Works for: New Leads, Attorneys, Medical Professionals, Insurance, Other callers
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 30000, // 30 seconds - prevents hanging on slow API calls
  maxRetries: 2   // Retry twice on failure
});

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
2. For phone numbers - extract as written or spoken
3. For claim numbers - look for any mention of "claim", "case number", "file number", etc.
4. For names - use the name they provide, include title if attorney (e.g., "Attorney John Smith")
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

=== FIELDS FOR ATTORNEY/MEDICAL/INSURANCE/OTHER CALLS ===
- who_representing: Organization/firm/facility they represent (null if not applicable)
- case_name: Patient name or client name they're calling about (null if not mentioned)
- claim_number: Any claim/case/file number mentioned (null if not mentioned)

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
    if (!extracted.email || extracted.email === 'null') {
      const emailMatch = transcriptText.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i);
      if (emailMatch) {
        extracted.email = emailMatch[1].toLowerCase();
      }
    }

    // Convert string "null" to actual null
    Object.keys(extracted).forEach(key => {
      if (extracted[key] === 'null' || extracted[key] === '') {
        extracted[key] = null;
      }
    });

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

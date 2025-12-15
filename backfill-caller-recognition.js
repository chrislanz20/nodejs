// Smart Backfill Script for Caller Recognition
// Uses Gemini 2.5 for AI extraction with category-specific prompts
// "We'd rather have MISSING data than WRONG data"

require('dotenv').config();
const { Pool } = require('pg');
const { Retell } = require('retell-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const callerCRM = require('./lib/callerCRM');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10
});

// Share pool with callerCRM
callerCRM.setPool(pool);

const retellClient = new Retell({
  apiKey: process.env.RETELL_API_KEY
});

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.Google_Gemini_API);
const geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

const COURTLAW_AGENT_ID = 'agent_8e50b96f7e7bb7ce7479219fcc';

// Professional caller categories (org + contact tracking)
const PROFESSIONAL_CATEGORIES = ['Attorney', 'Insurance', 'Medical', 'Medical Professional'];

// Individual caller categories (caller profile tracking)
const INDIVIDUAL_CATEGORIES = ['New Lead', 'Existing Client'];

// ============================================
// GEMINI AI EXTRACTION FUNCTIONS
// ============================================

/**
 * Build category-specific prompt for Gemini extraction
 * Different categories need different fields extracted
 */
function buildExtractionPrompt(category, transcriptText) {
  const baseInstructions = `You are extracting structured data from a phone call transcript for CourtLaw, a personal injury law firm.

CRITICAL RULES:
1. Only extract data that was EXPLICITLY STATED in the transcript
2. If something wasn't mentioned, return null - NEVER guess or assume
3. Quality over quantity - missing data is better than wrong data
4. For names: Only extract if the caller clearly stated their name
5. For claim numbers: Only extract if spelled out or confirmed by the agent
6. For organizations: Only extract if the caller said which company they're calling from

LANGUAGE DETECTION:
- Analyze the transcript to determine if the caller speaks English or Spanish
- Look at the actual words spoken by the caller (user role)
- If Spanish words/phrases are used, set language to "spanish"
- Otherwise, set language to "english"

CRITICAL - PHONE NUMBERS AND CLAIM NUMBERS:
- ALWAYS convert spoken numbers to DIGITS, regardless of language
- Spanish: "tres cuatro siete" → "347", "uno dos tres" → "123"
- "cero" → "0", "uno" → "1", "dos" → "2", "tres" → "3", "cuatro" → "4"
- "cinco" → "5", "seis" → "6", "siete" → "7", "ocho" → "8", "nueve" → "9"
- Phone numbers should be formatted as: XXX-XXX-XXXX or with ext if extension provided
- Claim numbers should be alphanumeric strings (letters and digits only)

`;

  let categoryFields = '';

  if (category === 'Insurance') {
    categoryFields = `
INSURANCE CALLER - Extract these fields:
{
  "caller_name": "Full name of the person calling (not the client)",
  "organization_name": "Insurance company name (Progressive, Geico, State Farm, etc.)",
  "client_name": "CourtLaw client's name they're calling about",
  "claim_number": "Policy or claim number as a STRING (preserve dashes, letters)",
  "callback_phone": "Direct callback number if provided (not the main line)",
  "email": "Email address if spelled out and confirmed",
  "fax": "Fax number if provided",
  "purpose": "Specific reason for the call (records request, status update, etc.)",
  "language": "english or spanish based on caller's speech"
}`;
  } else if (category === 'Medical' || category === 'Medical Professional') {
    categoryFields = `
MEDICAL CALLER - Extract these fields:
{
  "caller_name": "Full name of the person calling",
  "organization_name": "Medical facility/office name (Dr. Smith's Office, XYZ Clinic, etc.)",
  "client_name": "Patient name (CourtLaw client) they're calling about",
  "callback_phone": "Direct callback number",
  "email": "Email address if spelled out and confirmed",
  "fax": "Fax number if provided",
  "purpose": "Reason for call (appointment scheduling, records, bills, etc.)",
  "language": "english or spanish based on caller's speech"
}`;
  } else if (category === 'Attorney') {
    categoryFields = `
ATTORNEY CALLER - Extract these fields:
{
  "caller_name": "Full name of the attorney or staff member calling",
  "organization_name": "Law firm name",
  "client_name": "Client name they're calling about (could be their client or CourtLaw's)",
  "case_number": "Case or file number if mentioned",
  "callback_phone": "Direct callback number",
  "email": "Email address if spelled out and confirmed",
  "fax": "Fax number if provided",
  "purpose": "Reason for call (case inquiry, representation letter, etc.)",
  "language": "english or spanish based on caller's speech"
}`;
  } else if (category === 'Existing Client') {
    categoryFields = `
EXISTING CLIENT - Extract these fields:
{
  "caller_name": "Full name of the client",
  "claim_number": "Their CourtLaw case number if mentioned",
  "callback_phone": "Preferred callback number if they provided one",
  "email": "Email address if provided",
  "purpose": "Reason for calling (status update, question, document, etc.)",
  "attorney_name": "Name of their attorney at CourtLaw if mentioned",
  "language": "english or spanish based on caller's speech"
}`;
  } else if (category === 'New Lead') {
    categoryFields = `
NEW LEAD - Extract these fields:
{
  "caller_name": "Full name of the potential new client",
  "callback_phone": "Phone number if provided",
  "email": "Email address if provided",
  "incident_date": "When the incident occurred (YYYY-MM-DD if possible)",
  "incident_location": "Where the incident happened",
  "incident_description": "Brief description of what happened",
  "case_type": "Type: car_accident, motorcycle, truck, rideshare, slip_fall, etc.",
  "injuries": "Types of injuries if mentioned",
  "referral_source": "How they heard about CourtLaw",
  "language": "english or spanish based on caller's speech"
}`;
  } else {
    categoryFields = `
OTHER CALLER - Extract these fields:
{
  "caller_name": "Full name if provided",
  "organization_name": "Company/organization if mentioned",
  "callback_phone": "Phone number if provided",
  "email": "Email if provided",
  "purpose": "Reason for calling",
  "language": "english or spanish based on caller's speech"
}`;
  }

  return `${baseInstructions}${categoryFields}

TRANSCRIPT:
${transcriptText}

Return ONLY valid JSON with the fields above. Use null for any field not clearly stated in the transcript.`;
}

/**
 * Extract data from transcript using Gemini 2.5
 */
async function extractWithGemini(transcript, category) {
  // Convert transcript to readable text
  const transcriptText = Array.isArray(transcript)
    ? transcript.map(m => `${m.role}: ${m.content}`).join('\n')
    : transcript;

  if (!transcriptText || transcriptText.length < 50) {
    return null;
  }

  const prompt = buildExtractionPrompt(category, transcriptText);

  try {
    const result = await geminiModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0, // Deterministic extraction
        maxOutputTokens: 1000,
      }
    });

    const response = result.response;
    const text = response.text();

    // Parse JSON from response (handle markdown code blocks)
    let extracted;
    try {
      // Try direct JSON parse first
      extracted = JSON.parse(text);
    } catch (e1) {
      // Try extracting from markdown code block
      const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        try {
          extracted = JSON.parse(jsonMatch[1]);
        } catch (e2) {
          console.log(`   ⚠️ Could not parse JSON from code block: ${e2.message}`);
          console.log(`   Raw: ${text.substring(0, 200)}...`);
          return null;
        }
      } else {
        // Try finding JSON object in the text
        const objectMatch = text.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          try {
            extracted = JSON.parse(objectMatch[0]);
          } catch (e3) {
            console.log(`   ⚠️ Could not parse extracted JSON: ${e3.message}`);
            console.log(`   Raw: ${text.substring(0, 200)}...`);
            return null;
          }
        } else {
          console.log(`   ⚠️ No JSON found in response`);
          console.log(`   Raw: ${text.substring(0, 200)}...`);
          return null;
        }
      }
    }

    // Clean up null strings
    Object.keys(extracted).forEach(key => {
      if (extracted[key] === 'null' || extracted[key] === '') {
        extracted[key] = null;
      }
    });

    return extracted;

  } catch (error) {
    console.error(`   ❌ Gemini extraction error: ${error.message}`);
    return null;
  }
}

/**
 * Check if a name is valid (not generic/placeholder)
 */
function isValidName(name) {
  if (!name || typeof name !== 'string') return false;
  const cleaned = name.trim();
  if (cleaned.length < 2) return false;

  const genericTerms = /^(the user|unknown|caller|client|agent|representative|user|n\/a|none|test|maria|courtlaw)$/i;
  if (genericTerms.test(cleaned)) return false;

  // Must have at least one capital letter (real names do)
  if (!/[A-Z]/.test(cleaned)) return false;

  return true;
}

/**
 * Map category to organization type
 */
function categoryToOrgType(category) {
  const mapping = {
    'Attorney': 'law_firm',
    'Insurance': 'insurance',
    'Medical': 'medical_office',
    'Medical Professional': 'medical_office'
  };
  return mapping[category] || 'other';
}

// ============================================
// MAIN BACKFILL FUNCTION
// ============================================

async function backfillCallerRecognition() {
  console.log('\n🚀 Starting Caller Recognition Backfill for CourtLaw...');
  console.log('📋 Strategy: HIGH CONFIDENCE extraction only');
  console.log('   - Only save data that was SPELLED OUT or CONFIRMED by Maria');
  console.log('   - Missing data is better than wrong data\n');

  try {
    // Initialize CRM tables (creates contact_client_associations if needed)
    console.log('🔧 Initializing Caller CRM tables...');
    await callerCRM.initializeCallerCRM();

    // Fetch all calls from Retell API
    console.log('📥 Fetching all historical calls from Retell API...');

    let allCalls = [];
    let paginationToken = null;
    let pageNum = 1;

    do {
      const options = { limit: 1000 };
      if (paginationToken) {
        options.pagination_key = paginationToken;
      }

      const response = await retellClient.call.list(options);
      const calls = Array.isArray(response) ? response : (response.calls || []);
      allCalls = allCalls.concat(calls);

      paginationToken = response.pagination_key || response.paginationKey || null;
      console.log(`   Page ${pageNum}: Fetched ${calls.length} calls...`);
      pageNum++;
    } while (paginationToken);

    // Filter for CourtLaw calls with transcripts
    const courtlawCalls = allCalls.filter(call =>
      call.agent_id === COURTLAW_AGENT_ID &&
      call.transcript_object &&
      call.transcript_object.length > 0
    );

    // Sort chronologically (oldest first)
    courtlawCalls.sort((a, b) => a.start_timestamp - b.start_timestamp);

    console.log(`✅ Found ${courtlawCalls.length} CourtLaw calls with transcripts\n`);

    // Fetch all categories for these calls
    console.log('📥 Fetching call categories...');
    const categoriesResult = await pool.query(`SELECT call_id, category FROM call_categories`);
    const categoriesMap = {};
    categoriesResult.rows.forEach(row => {
      categoriesMap[row.call_id] = row.category;
    });
    console.log(`✅ Found ${categoriesResult.rows.length} categorized calls\n`);

    // Statistics
    const stats = {
      total: courtlawCalls.length,
      processed: 0,
      skipped: 0,
      orgsCreated: 0,
      contactsCreated: 0,
      clientAssociationsCreated: 0,
      callersCreated: 0,
      errors: 0,
      byCategory: {}
    };

    console.log('🔄 Processing calls with Gemini 2.5 AI extraction...\n');

    for (const call of courtlawCalls) {
      const category = categoriesMap[call.call_id];

      // Skip uncategorized or "Other" calls
      if (!category || category === 'Other') {
        stats.skipped++;
        continue;
      }

      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;

      try {
        const transcript = call.transcript_object;

        if (PROFESSIONAL_CATEGORIES.includes(category)) {
          // PROFESSIONAL CALLER: org + contact + client association
          await processProfessionalCaller(call, category, transcript, stats);
        } else if (INDIVIDUAL_CATEGORIES.includes(category)) {
          // INDIVIDUAL CALLER: caller profile
          await processIndividualCaller(call, category, transcript, stats);
        }

        stats.processed++;

        // Progress every 50 calls (more frequent for AI calls)
        if (stats.processed % 50 === 0) {
          console.log(`📊 Progress: ${stats.processed}/${courtlawCalls.length} processed...`);
        }

        // Rate limiting: small delay between Gemini API calls
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        stats.errors++;
        console.error(`❌ Error processing call ${call.call_id}:`, error.message);
      }
    }

    // Final summary
    printSummary(stats);

  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

/**
 * Process a professional caller (Attorney, Insurance, Medical) using Gemini
 */
async function processProfessionalCaller(call, category, transcript, stats) {
  const fromPhone = call.from_number;

  // Extract data using Gemini
  const extracted = await extractWithGemini(transcript, category);

  if (!extracted) {
    return;
  }

  const { caller_name, organization_name, client_name, claim_number, callback_phone, email, fax, language } = extracted;

  // Skip if we have nothing useful
  if (!organization_name && !caller_name && !client_name) {
    return;
  }

  // Get or create organization
  let org = null;
  if (organization_name) {
    org = await callerCRM.getOrCreateOrganization({
      name: organization_name,
      type: categoryToOrgType(category),
      phoneNumber: fromPhone,
      contactName: caller_name
    }, COURTLAW_AGENT_ID);

    if (org?.isNew) {
      stats.orgsCreated++;
      console.log(`   🏢 NEW ORG: ${organization_name} (${category})`);
    }
  }

  // Get or create contact at this organization
  let contact = null;
  if (org && caller_name) {
    contact = await callerCRM.getOrCreateOrganizationContact(org.id, {
      name: caller_name,
      email: email,
      phone: callback_phone || fromPhone,
      fax: fax,
      preferredLanguage: language || 'english'
    });

    if (contact?.isNew) {
      stats.contactsCreated++;
      console.log(`   📇 NEW CONTACT: ${caller_name} at ${org.name} [${language || 'english'}]`);
    }
  }

  // Create contact-client association if we know who they're calling about
  if (contact && client_name) {
    const association = await callerCRM.getOrCreateContactClientAssociation(contact.id, {
      clientName: client_name,
      claimNumber: claim_number,
      callId: call.call_id
    });

    if (association?.isNew) {
      stats.clientAssociationsCreated++;
      console.log(`   📋 NEW ASSOCIATION: ${caller_name || 'Contact'} → ${client_name}`);
    }
  }
}

/**
 * Process an individual caller (Existing Client, New Lead) using Gemini
 */
async function processIndividualCaller(call, category, transcript, stats) {
  const fromPhone = call.from_number;

  // Extract data using Gemini
  const extracted = await extractWithGemini(transcript, category);

  if (!extracted) {
    return;
  }

  const { caller_name, callback_phone, email, claim_number, language } = extracted;

  // Skip if we have nothing useful
  if (!caller_name && !email && !claim_number) {
    return;
  }

  // Get or create caller
  const caller = await callerCRM.getOrCreateCaller(fromPhone, COURTLAW_AGENT_ID, call.call_id);

  if (!caller) return;

  const isNew = caller.isNew;

  // Update caller type
  const callerType = category === 'New Lead' ? 'new_lead' : 'existing_client';
  await callerCRM.updateCallerType(caller.id, callerType);

  // Update language preference
  if (language) {
    await callerCRM.updateCallerLanguage(caller.id, language);
  }

  // Update fields with extracted data
  if (caller_name && isValidName(caller_name)) {
    await callerCRM.updateCallerField(caller.id, 'name', caller_name, {
      sourceCallId: call.call_id,
      confidence: 'gemini_extracted'
    });
  }

  if (email) {
    await callerCRM.updateCallerField(caller.id, 'email', email, {
      sourceCallId: call.call_id,
      confidence: 'gemini_extracted'
    });
  }

  if (claim_number) {
    await callerCRM.updateCallerField(caller.id, 'claim_num', claim_number, {
      sourceCallId: call.call_id,
      confidence: 'gemini_extracted'
    });
  }

  if (callback_phone) {
    await callerCRM.updateCallerField(caller.id, 'callback_phone', callback_phone, {
      sourceCallId: call.call_id,
      confidence: 'gemini_extracted'
    });
  }

  if (isNew) {
    stats.callersCreated++;
    console.log(`   👤 NEW CALLER: ${caller_name || fromPhone} (${category}) [${language || 'english'}]`);
  }
}

/**
 * Print final summary
 */
function printSummary(stats) {
  console.log('\n' + '='.repeat(60));
  console.log('📊 CALLER RECOGNITION BACKFILL COMPLETE (Gemini 2.5)');
  console.log('='.repeat(60));
  console.log(`Total Calls:              ${stats.total}`);
  console.log(`Processed:                ${stats.processed}`);
  console.log(`Skipped (no category):    ${stats.skipped}`);
  console.log(`Errors:                   ${stats.errors}`);
  console.log('');
  console.log('📈 RECORDS CREATED:');
  console.log(`   Organizations:         ${stats.orgsCreated}`);
  console.log(`   Org Contacts:          ${stats.contactsCreated}`);
  console.log(`   Client Associations:   ${stats.clientAssociationsCreated}`);
  console.log(`   Individual Callers:    ${stats.callersCreated}`);
  console.log('');
  console.log('📁 CALLS BY CATEGORY:');
  Object.entries(stats.byCategory)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
      console.log(`   ${cat}: ${count}`);
    });
  console.log('='.repeat(60) + '\n');

  console.log('✅ Backfill completed!');
  console.log('👉 Data extracted using Gemini 2.5 AI');
  console.log('👉 Run spot-checks to verify extraction quality.\n');
}

// ============================================
// DRY RUN MODE (preview Gemini extraction without saving)
// ============================================

async function dryRun(limit = 5) {
  console.log('\n🔍 DRY RUN MODE - Preview Gemini extraction without saving\n');

  try {
    // Fetch some calls
    console.log('📥 Fetching calls from Retell API...');
    const response = await retellClient.call.list({ limit: 100 });
    const calls = Array.isArray(response) ? response : (response.calls || []);
    console.log(`   Fetched ${calls.length} calls`);

    // Filter for CourtLaw
    const courtlawCalls = calls.filter(c =>
      c.agent_id === COURTLAW_AGENT_ID &&
      c.transcript_object?.length > 0
    ).slice(0, limit);

    console.log(`   Found ${courtlawCalls.length} CourtLaw calls with transcripts`);

    if (courtlawCalls.length === 0) {
      console.log('\n⚠️ No CourtLaw calls with transcripts found in the first 100 calls.');
      console.log('   Try running the full backfill which fetches all calls.');
      return;
    }

    // Get categories
    console.log('📥 Fetching categories from database...');
    const categoriesResult = await pool.query(`SELECT call_id, category FROM call_categories`);
    const categoriesMap = {};
    categoriesResult.rows.forEach(row => {
      categoriesMap[row.call_id] = row.category;
    });
    console.log(`   Found ${categoriesResult.rows.length} categorized calls`);

    let shown = 0;
    for (const call of courtlawCalls) {
      const category = categoriesMap[call.call_id];
      if (!category || category === 'Other') continue;

      console.log('\n' + '='.repeat(60));
      console.log(`CALL: ${call.call_id}`);
      console.log(`FROM: ${call.from_number}`);
      console.log(`CATEGORY: ${category}`);
      console.log('='.repeat(60));

      const transcript = call.transcript_object;

      // Use Gemini extraction
      console.log('\n🤖 GEMINI 2.5 EXTRACTION:');
      const extracted = await extractWithGemini(transcript, category);

      if (extracted) {
        Object.entries(extracted).forEach(([key, value]) => {
          if (value) {
            console.log(`  ${key}: ${value}`);
          }
        });
      } else {
        console.log('  ❌ No data extracted');
      }

      // Show what Retell extracted for comparison
      const extractedData = call.extracted_data || {};
      console.log('\nRETELL EXTRACTED_DATA (for comparison):');
      console.log(`  Name:    ${extractedData.name || '❌'}`);
      console.log(`  Email:   ${extractedData.email || '❌'}`);
      console.log(`  Claim #: ${extractedData.claim_num || extractedData.claim_number || '❌'}`);

      shown++;

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`\n\n✅ Showed ${shown} calls with Gemini extraction`);

  } catch (error) {
    console.error('❌ Error in dry run:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// ============================================
// RUN
// ============================================

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run') || args.includes('-d');
const dryRunLimit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 10;

if (isDryRun) {
  dryRun(dryRunLimit)
    .then(() => process.exit(0))
    .catch(error => {
      console.error('💥 Dry run failed:', error);
      process.exit(1);
    });
} else {
  backfillCallerRecognition()
    .then(() => {
      console.log('👋 Exiting...');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Backfill failed:', error);
      process.exit(1);
    });
}

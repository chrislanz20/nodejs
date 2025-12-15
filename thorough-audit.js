// THOROUGH CRM DATA AUDIT
// Verifies extracted data against actual Retell transcripts
// Uses careful manual review - no shortcuts

require('dotenv').config();
const { Pool } = require('pg');
const Retell = require('retell-sdk').default;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });

// CourtLaw agent IDs
const AGENT_IDS = [
  'agent_f2bc1ab69af57533174f607ab8', // CourtLaw Dec
  'agent_e0d59cb68ba606e4a1d01c33db'  // CourtLaw (older)
];

function formatPhone(phone) {
  if (!phone) return 'N/A';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
  }
  return phone;
}

function transcriptToText(transcript) {
  if (!transcript) return '';
  if (typeof transcript === 'string') return transcript;
  if (Array.isArray(transcript)) {
    return transcript.map(t => `${t.role}: ${t.content}`).join('\n');
  }
  return JSON.stringify(transcript);
}

// Convert spoken numbers to digits
function convertSpokenToDigits(text) {
  if (!text) return text;

  const wordMap = {
    'zero': '0', 'oh': '0', 'o': '0',
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

  let result = text.toLowerCase();
  for (const [word, digit] of Object.entries(wordMap)) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    result = result.replace(regex, digit);
  }
  return result;
}

// Find claim number in transcript text
function findClaimInTranscript(text, claimNumber) {
  if (!text || !claimNumber) return { found: false };

  const textLower = text.toLowerCase();
  const claimLower = claimNumber.toLowerCase();

  // Try exact match first
  if (textLower.includes(claimLower)) {
    return { found: true, method: 'exact' };
  }

  // Try without special characters
  const claimClean = claimLower.replace(/[^a-z0-9]/g, '');
  const textClean = textLower.replace(/[^a-z0-9 ]/g, '');
  if (textClean.includes(claimClean)) {
    return { found: true, method: 'normalized' };
  }

  // Convert spoken numbers in transcript to digits and try again
  const textConverted = convertSpokenToDigits(textLower).replace(/[^a-z0-9]/g, '');
  if (textConverted.includes(claimClean)) {
    return { found: true, method: 'spoken-to-digits' };
  }

  // Try splitting claim number and finding parts
  const parts = claimNumber.split(/[-\s]/);
  if (parts.length > 1) {
    const allPartsFound = parts.every(p =>
      textLower.includes(p.toLowerCase())
    );
    if (allPartsFound) {
      return { found: true, method: 'parts' };
    }
  }

  // Try finding at least 70% of consecutive digits from the claim number
  const digitsOnly = claimClean.replace(/[^0-9]/g, '');
  if (digitsOnly.length >= 5) {
    // Check if most of the digits appear in order in the converted text
    let matchCount = 0;
    let textPos = 0;
    for (const digit of digitsOnly) {
      const foundPos = textConverted.indexOf(digit, textPos);
      if (foundPos !== -1) {
        matchCount++;
        textPos = foundPos + 1;
      }
    }
    const matchPercent = matchCount / digitsOnly.length;
    if (matchPercent >= 0.7) {
      return { found: true, method: `partial-match (${Math.round(matchPercent * 100)}%)` };
    }
  }

  return { found: false };
}

async function thoroughAudit() {
  console.log('='.repeat(100));
  console.log('THOROUGH CRM DATA AUDIT');
  console.log('Verifying extracted data against actual Retell transcripts');
  console.log('='.repeat(100));
  console.log();

  const issues = [];

  try {
    // 1. Get ALL records with claim numbers from contact_client_associations
    console.log('🔍 STEP 1: Fetching all records with claim numbers...');
    console.log('-'.repeat(100));

    const callsWithClaims = await pool.query(`
      SELECT
        cca.id,
        cca.client_name as name,
        cca.claim_number,
        cca.first_mentioned_call_id as call_id,
        cca.created_at,
        oc.name as contact_name,
        o.name as org_name
      FROM contact_client_associations cca
      LEFT JOIN organization_contacts oc ON cca.organization_contact_id = oc.id
      LEFT JOIN organizations o ON oc.organization_id = o.id
      WHERE cca.claim_number IS NOT NULL
        AND cca.claim_number != ''
      ORDER BY cca.created_at DESC
    `);

    console.log(`Found ${callsWithClaims.rows.length} calls with claim numbers\n`);

    // 2. Verify EACH claim number against actual transcript
    console.log('🔍 STEP 2: Verifying each claim number against Retell transcript...');
    console.log('-'.repeat(100));
    console.log();

    let verified = 0;
    let notFound = 0;
    let errors = 0;

    for (let i = 0; i < callsWithClaims.rows.length; i++) {
      const call = callsWithClaims.rows[i];
      console.log(`[${i + 1}/${callsWithClaims.rows.length}] Call: ${call.call_id?.substring(0, 30)}...`);
      console.log(`   Client: ${call.name || 'N/A'}`);
      console.log(`   Contact: ${call.contact_name || 'N/A'}`);
      console.log(`   Organization: ${call.org_name || 'N/A'}`);
      console.log(`   Claim #: ${call.claim_number}`);
      console.log(`   Date: ${call.created_at}`);

      if (!call.call_id) {
        console.log(`   ⚠️  NO SOURCE CALL ID (manually added?)`);
        issues.push({
          call_id: null,
          issue: 'No source call ID',
          claim_number: call.claim_number,
          name: call.name,
          org_name: call.org_name
        });
        errors++;
        console.log();
        continue;
      }

      try {
        // Fetch actual transcript from Retell
        const retellCall = await retell.call.retrieve(call.call_id);
        const transcript = transcriptToText(retellCall.transcript_object || retellCall.transcript);

        if (!transcript) {
          console.log(`   ⚠️  NO TRANSCRIPT AVAILABLE`);
          issues.push({
            call_id: call.call_id,
            issue: 'No transcript',
            claim_number: call.claim_number
          });
          errors++;
          console.log();
          continue;
        }

        // Check if claim number appears in transcript
        const result = findClaimInTranscript(transcript, call.claim_number);

        if (result.found) {
          console.log(`   ✅ VERIFIED (${result.method} match)`);
          verified++;
        } else {
          console.log(`   ❌ NOT FOUND IN TRANSCRIPT`);
          console.log(`   📝 Transcript excerpt:`);

          // Show relevant parts of transcript that might contain claim info
          const lines = transcript.split('\n');
          const relevantLines = lines.filter(l =>
            l.toLowerCase().includes('claim') ||
            l.toLowerCase().includes('number') ||
            l.toLowerCase().includes('case') ||
            l.toLowerCase().includes('file')
          );

          if (relevantLines.length > 0) {
            relevantLines.slice(0, 5).forEach(l => {
              console.log(`      ${l.substring(0, 150)}`);
            });
          } else {
            // Show first few lines
            lines.slice(0, 3).forEach(l => {
              console.log(`      ${l.substring(0, 150)}`);
            });
          }

          issues.push({
            call_id: call.call_id,
            issue: 'Claim number not in transcript',
            claim_number: call.claim_number,
            name: call.name,
            org_name: call.org_name
          });
          notFound++;
        }
      } catch (err) {
        console.log(`   ⚠️  ERROR: ${err.message}`);
        issues.push({
          call_id: call.call_id,
          issue: `API Error: ${err.message}`,
          claim_number: call.claim_number
        });
        errors++;
      }

      console.log();

      // Rate limit - don't hammer Retell API
      await new Promise(r => setTimeout(r, 200));
    }

    // 3. Summary
    console.log('='.repeat(100));
    console.log('CLAIM NUMBER VERIFICATION SUMMARY');
    console.log('='.repeat(100));
    console.log(`Total calls with claim numbers: ${callsWithClaims.rows.length}`);
    console.log(`✅ Verified in transcript: ${verified}`);
    console.log(`❌ Not found in transcript: ${notFound}`);
    console.log(`⚠️  Errors/No transcript: ${errors}`);
    console.log();

    if (issues.length > 0) {
      console.log('❌ ISSUES REQUIRING REVIEW:');
      console.log('-'.repeat(100));
      issues.forEach((issue, idx) => {
        console.log(`${idx + 1}. ${issue.issue}`);
        console.log(`   Call ID: ${issue.call_id?.substring(0, 40)}...`);
        console.log(`   Claim #: ${issue.claim_number}`);
        if (issue.name) console.log(`   Client: ${issue.name}`);
        if (issue.org_name) console.log(`   Organization: ${issue.org_name}`);
        console.log();
      });
    }

    // 4. Check caller_details table for claim numbers
    console.log('='.repeat(100));
    console.log('CALLER DETAILS - CLAIM NUMBERS');
    console.log('='.repeat(100));

    try {
      const callerClaims = await pool.query(`
        SELECT
          cd.field_value as claim_number,
          cd.source_call_id,
          cd.confidence,
          cd.recorded_at,
          c.phone_number,
          c.caller_type
        FROM caller_details cd
        JOIN callers c ON cd.caller_id = c.id
        WHERE cd.field_name = 'claim_number'
        ORDER BY cd.recorded_at DESC
        LIMIT 20
      `);

      console.log(`Found ${callerClaims.rows.length} claim numbers in caller_details\n`);

      for (const claim of callerClaims.rows) {
        console.log(`Phone: ${formatPhone(claim.phone_number)} | Claim: ${claim.claim_number} | Type: ${claim.caller_type} | Confidence: ${claim.confidence || 'N/A'}`);
      }
    } catch (e) {
      console.log('(Table may have different schema or be empty)');
    }

    // 5. Check clients table for claim numbers
    console.log('\n' + '='.repeat(100));
    console.log('CLIENTS TABLE - CLAIM NUMBERS');
    console.log('='.repeat(100));

    try {
      const clients = await pool.query(`
        SELECT
          id, name, email, phone, claim_number, case_type, created_at
        FROM clients
        WHERE claim_number IS NOT NULL
          AND claim_number != ''
        ORDER BY created_at DESC
        LIMIT 20
      `);

      console.log(`Found ${clients.rows.length} clients with claim numbers\n`);

      for (const client of clients.rows) {
        console.log(`${client.name || 'N/A'} | Phone: ${formatPhone(client.phone)} | Claim: ${client.claim_number} | Type: ${client.case_type || 'N/A'}`);
      }
    } catch (e) {
      console.log('(Table may have different schema or be empty)');
    }

  } catch (error) {
    console.error('Audit error:', error);
  } finally {
    await pool.end();
  }
}

thoroughAudit();

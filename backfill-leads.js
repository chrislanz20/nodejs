// Backfill script to populate leads table with historical data
// Processes all CourtLaw calls chronologically to detect conversions

require('dotenv').config();
const { Pool } = require('pg');
const { Retell } = require('retell-sdk');
const { trackLead } = require('./lib/leadTracking');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL_NON_POOLING
});

const retellClient = new Retell({
  apiKey: process.env.RETELL_API_KEY
});

const COURTLAW_AGENT_ID = 'agent_8e50b96f7e7bb7ce7479219fcc';

async function backfillLeads() {
  console.log('\n🚀 Starting Lead Backfill for CourtLaw...\n');

  try {
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

      // Debug: Check response structure
      if (!response) {
        console.error('Response is undefined');
        break;
      }

      // The response might be an array directly, not an object with a calls property
      const calls = Array.isArray(response) ? response : (response.calls || []);
      allCalls = allCalls.concat(calls);

      // Check for pagination key in different possible locations
      paginationToken = response.pagination_key || response.paginationKey || null;

      console.log(`   Page ${pageNum}: Fetched ${calls.length} calls...`);
      pageNum++;
    } while (paginationToken);

    // Filter for CourtLaw calls only
    const courtlawCalls = allCalls.filter(call => call.agent_id === COURTLAW_AGENT_ID);

    // Sort chronologically (oldest first)
    courtlawCalls.sort((a, b) => a.start_timestamp - b.start_timestamp);

    console.log(`✅ Found ${courtlawCalls.length} CourtLaw calls (out of ${allCalls.length} total)\n`);

    // Fetch all categories for these calls
    console.log('📥 Fetching call categories...');
    const categoriesResult = await pool.query(
      `SELECT call_id, category FROM call_categories`
    );

    const categoriesMap = {};
    categoriesResult.rows.forEach(row => {
      categoriesMap[row.call_id] = row.category;
    });
    console.log(`✅ Found ${categoriesResult.rows.length} categorized calls\n`);

    // Statistics
    let processed = 0;
    let newLeadsCreated = 0;
    let conversionsDetected = 0;
    let skipped = 0;
    let errors = 0;

    console.log('🔄 Processing calls chronologically...\n');

    // Process each call in chronological order
    for (const call of courtlawCalls) {
      const category = categoriesMap[call.call_id];

      // Skip uncategorized calls
      if (!category) {
        skipped++;
        continue;
      }

      // Extract name using robust extraction logic
      let extractedName = null;

      // Priority 1: extracted_data.name (if full name)
      if (call.extracted_data?.name) {
        const name = call.extracted_data.name.trim();
        if (name.includes(' ') && !name.toLowerCase().match(/^(the user|unknown|caller|client)$/i)) {
          extractedName = name;
        }
      }

      // Priority 2: extracted_data.first_name + last_name
      if (!extractedName && (call.extracted_data?.first_name || call.extracted_data?.last_name)) {
        const firstName = call.extracted_data.first_name?.trim() || '';
        const lastName = call.extracted_data.last_name?.trim() || '';
        const fullName = `${firstName} ${lastName}`.trim();
        if (fullName && fullName !== 'The user' && fullName.length > 2) {
          extractedName = fullName;
        }
      }

      // Priority 3: Extract from call_analysis.call_summary
      if (!extractedName && call.call_analysis?.call_summary) {
        const summary = call.call_analysis.call_summary;

        const namePatterns = [
          /(?:The user|caller),\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+),/i,
          /(?:user'?s? name is|named?|called)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
          /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(?:called|contacted|reached out)/i,
          /identified (?:himself|herself|themselves) as ([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
          /(?:I'm|I am|This is|My name is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
        ];

        for (const pattern of namePatterns) {
          const match = summary.match(pattern);
          if (match && match[1]) {
            const name = match[1].trim();
            if (!name.match(/^(The User|Unknown|Caller|Client|Agent|Representative)$/i)) {
              extractedName = name;
              break;
            }
          }
        }
      }

      // Build call data
      const callData = {
        phone: call.from_number,
        phone_number: call.from_number,
        from_number: call.from_number,
        name: extractedName,
        email: call.extracted_data?.email || null,
        incident_description: call.call_analysis?.call_summary || null
      };

      try {
        const result = await trackLead(call.call_id, COURTLAW_AGENT_ID, category, callData);

        if (result) {
          if (result.isNewLead) {
            newLeadsCreated++;
            console.log(`✅ NEW LEAD: ${callData.name || callData.phone} - ${category}`);
          }

          if (result.conversionDetected) {
            conversionsDetected++;
            console.log(`🎉 CONVERSION DETECTED: ${callData.name || callData.phone} (New Lead → Existing Client)`);
          }
        }

        processed++;

        // Show progress every 100 calls
        if (processed % 100 === 0) {
          console.log(`📊 Progress: ${processed}/${courtlawCalls.length} calls processed...`);
        }

      } catch (error) {
        errors++;
        console.error(`❌ Error processing call ${call.call_id}:`, error.message);
      }
    }

    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 BACKFILL COMPLETE - SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Calls:           ${courtlawCalls.length}`);
    console.log(`Processed:             ${processed}`);
    console.log(`Skipped (no category): ${skipped}`);
    console.log(`Errors:                ${errors}`);
    console.log('');
    console.log(`🆕 New Leads Created:   ${newLeadsCreated}`);
    console.log(`🎉 Conversions Detected: ${conversionsDetected}`);
    console.log('='.repeat(60) + '\n');

    console.log('✅ Backfill completed successfully!');
    console.log('👉 Check the Lead Tracker in the dashboard to see all leads\n');

  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the backfill
backfillLeads()
  .then(() => {
    console.log('👋 Exiting...');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Backfill failed:', error);
    process.exit(1);
  });

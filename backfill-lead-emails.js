// Backfill script to extract missing email data from call transcripts
// Uses AI to extract email, incident_date, and incident_location from transcripts

require('dotenv').config();
const { Pool } = require('pg');
const { Retell } = require('retell-sdk');
const { extractLeadDataFromTranscript } = require('./lib/extractLeadData');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10
});

const retellClient = new Retell({
  apiKey: process.env.RETELL_API_KEY
});

async function backfillLeadEmails() {
  console.log('\n🚀 Starting Email Backfill for Leads...\\n');

  try {
    // Get all leads (prioritize those missing email)
    const result = await pool.query(`
      SELECT id, call_id, phone_number, name, email, incident_date, incident_location
      FROM leads
      ORDER BY
        CASE WHEN email IS NULL OR email = '' THEN 0 ELSE 1 END,  -- Prioritize missing emails
        first_call_date DESC
    `);

    const leads = result.rows;
    console.log(`📊 Found ${leads.length} total leads`);

    const leadsNeedingEmail = leads.filter(l => !l.email || l.email === '');
    console.log(`   ${leadsNeedingEmail.length} leads missing email`);
    console.log(`   Starting extraction...\\n`);

    let processed = 0;
    let emailsExtracted = 0;
    let datesExtracted = 0;
    let locationsExtracted = 0;
    let errors = 0;
    let skippedNoTranscript = 0;

    for (const lead of leads) {
      try {
        // Skip if lead already has all data
        if (lead.email && lead.incident_date && lead.incident_location) {
          console.log(`⏭️  Lead ${lead.id} already has all data - skipping`);
          processed++;
          continue;
        }

        // Fetch call from Retell
        console.log(`🔍 Processing lead ${lead.id} (${lead.phone_number})...`);
        const call = await retellClient.call.retrieve(lead.call_id);

        if (!call.transcript || call.transcript.trim().length === 0) {
          console.log(`   ⚠️  No transcript available - skipping`);
          skippedNoTranscript++;
          processed++;
          continue;
        }

        // Extract data from transcript
        console.log(`   🤖 Extracting data from transcript...`);
        const extracted = await extractLeadDataFromTranscript(call.transcript);

        if (!extracted) {
          console.log(`   ⚠️  Extraction failed - skipping`);
          errors++;
          processed++;
          continue;
        }

        // Update lead with extracted data (only update fields that are currently empty)
        const updates = [];
        const params = [];
        let paramCount = 1;

        if (extracted.email && (!lead.email || lead.email === '')) {
          updates.push(`email = $${paramCount++}`);
          params.push(extracted.email);
          emailsExtracted++;
        }

        if (extracted.incident_date && !lead.incident_date) {
          updates.push(`incident_date = $${paramCount++}`);
          params.push(extracted.incident_date);
          datesExtracted++;
        }

        if (extracted.incident_location && (!lead.incident_location || lead.incident_location === '')) {
          updates.push(`incident_location = $${paramCount++}`);
          params.push(extracted.incident_location);
          locationsExtracted++;
        }

        // Update incident_description if extracted one is better (longer/more detailed)
        if (extracted.incident_description &&
            (!lead.incident_description || extracted.incident_description.length > (lead.incident_description?.length || 0))) {
          updates.push(`incident_description = $${paramCount++}`);
          params.push(extracted.incident_description);
        }

        if (updates.length > 0) {
          updates.push(`updated_at = CURRENT_TIMESTAMP`);
          params.push(lead.id);

          await pool.query(
            `UPDATE leads SET ${updates.join(', ')} WHERE id = $${paramCount}`,
            params
          );

          console.log(`   ✅ Updated: ${extracted.email ? 'email ' : ''}${extracted.incident_date ? 'date ' : ''}${extracted.incident_location ? 'location' : ''}`);
        } else {
          console.log(`   ℹ️  No new data to update`);
        }

        processed++;

        // Progress update every 10 leads
        if (processed % 10 === 0) {
          console.log(`\\n📊 Progress: ${processed}/${leads.length} leads processed...\\n`);
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        errors++;
        console.error(`   ❌ Error processing lead ${lead.id}:`, error.message);
      }
    }

    // Final summary
    console.log('\\n' + '='.repeat(60));
    console.log('📊 BACKFILL COMPLETE - SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Leads Processed:      ${processed}`);
    console.log(`Emails Extracted:           ${emailsExtracted}`);
    console.log(`Incident Dates Extracted:   ${datesExtracted}`);
    console.log(`Incident Locations Extracted: ${locationsExtracted}`);
    console.log(`Skipped (no transcript):    ${skippedNoTranscript}`);
    console.log(`Errors:                     ${errors}`);
    console.log('='.repeat(60) + '\\n');

    // Show stats on current data completeness
    const statsResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(email) FILTER (WHERE email IS NOT NULL AND email != '') as with_email,
        COUNT(incident_date) FILTER (WHERE incident_date IS NOT NULL) as with_date,
        COUNT(incident_location) FILTER (WHERE incident_location IS NOT NULL AND incident_location != '') as with_location
      FROM leads
    `);

    const stats = statsResult.rows[0];
    console.log('📈 Data Completeness:');
    console.log(`Leads with Email:    ${stats.with_email}/${stats.total} (${Math.round(stats.with_email / stats.total * 100)}%)`);
    console.log(`Leads with Date:     ${stats.with_date}/${stats.total} (${Math.round(stats.with_date / stats.total * 100)}%)`);
    console.log(`Leads with Location: ${stats.with_location}/${stats.total} (${Math.round(stats.with_location / stats.total * 100)}%)`);
    console.log('\\n✅ Backfill completed successfully!\\n');

  } catch (error) {
    console.error('\\n❌ FATAL ERROR:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the backfill
backfillLeadEmails()
  .then(() => {
    console.log('👋 Exiting...');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Backfill failed:', error);
    process.exit(1);
  });

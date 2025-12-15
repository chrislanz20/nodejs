// Export transcripts for manual review
// Outputs transcripts grouped by category for Claude to manually extract data

require('dotenv').config();
const { Pool } = require('pg');
const { Retell } = require('retell-sdk');
const fs = require('fs');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING,
  ssl: { rejectUnauthorized: false }
});

const retellClient = new Retell({
  apiKey: process.env.RETELL_API_KEY
});

const COURTLAW_AGENT_ID = 'agent_8e50b96f7e7bb7ce7479219fcc';

async function exportTranscripts() {
  console.log('\n📥 Exporting transcripts for manual review...\n');

  try {
    // Fetch all calls from Retell API
    console.log('Fetching calls from Retell API...');
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

    // Fetch categories
    console.log('Fetching call categories...');
    const categoriesResult = await pool.query(`SELECT call_id, category FROM call_categories`);
    const categoriesMap = {};
    categoriesResult.rows.forEach(row => {
      categoriesMap[row.call_id] = row.category;
    });
    console.log(`✅ Found ${categoriesResult.rows.length} categorized calls\n`);

    // Group calls by category
    const byCategory = {};

    for (const call of courtlawCalls) {
      const category = categoriesMap[call.call_id] || 'Uncategorized';
      if (!byCategory[category]) {
        byCategory[category] = [];
      }

      // Convert transcript to readable text
      const transcriptText = call.transcript_object
        .map(m => `${m.role.toUpperCase()}: ${m.content}`)
        .join('\n');

      byCategory[category].push({
        call_id: call.call_id,
        from_number: call.from_number,
        start_timestamp: call.start_timestamp,
        date: new Date(call.start_timestamp).toISOString(),
        duration_seconds: call.end_timestamp ? Math.round((call.end_timestamp - call.start_timestamp) / 1000) : null,
        transcript: transcriptText,
        extracted_data: call.extracted_data || {}
      });
    }

    // Write to file for review
    const outputPath = '/Users/chrislanzilli/nodejs/transcripts-for-review.json';
    fs.writeFileSync(outputPath, JSON.stringify(byCategory, null, 2));
    console.log(`✅ Exported to ${outputPath}\n`);

    // Summary
    console.log('📊 CALLS BY CATEGORY:');
    Object.entries(byCategory)
      .sort((a, b) => b[1].length - a[1].length)
      .forEach(([cat, calls]) => {
        console.log(`   ${cat}: ${calls.length} calls`);
      });

    // Also write a summary of existing data in the CRM
    console.log('\n📊 CURRENT CRM DATA:');

    const orgs = await pool.query(`SELECT COUNT(*) FROM organizations WHERE agent_id = $1`, [COURTLAW_AGENT_ID]);
    const contacts = await pool.query(`SELECT COUNT(*) FROM organization_contacts WHERE organization_id IN (SELECT id FROM organizations WHERE agent_id = $1)`, [COURTLAW_AGENT_ID]);
    const associations = await pool.query(`SELECT COUNT(*) FROM contact_client_associations`);
    const callers = await pool.query(`SELECT COUNT(*) FROM callers WHERE agent_id = $1`, [COURTLAW_AGENT_ID]);
    const existingClients = await pool.query(`SELECT COUNT(*) FROM callers WHERE agent_id = $1 AND caller_type = 'existing_client'`, [COURTLAW_AGENT_ID]);
    const newLeads = await pool.query(`SELECT COUNT(*) FROM callers WHERE agent_id = $1 AND caller_type = 'new_lead'`, [COURTLAW_AGENT_ID]);

    console.log(`   Organizations: ${orgs.rows[0].count}`);
    console.log(`   Org Contacts: ${contacts.rows[0].count}`);
    console.log(`   Client Associations: ${associations.rows[0].count}`);
    console.log(`   Callers: ${callers.rows[0].count}`);
    console.log(`   - Existing Clients: ${existingClients.rows[0].count}`);
    console.log(`   - New Leads: ${newLeads.rows[0].count}`);

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

exportTranscripts()
  .then(() => {
    console.log('\n✅ Export complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Export failed:', error);
    process.exit(1);
  });

// Compare what was extracted/sent in email notifications vs what's actually in the transcript
require('dotenv').config();
const Retell = require('retell-sdk').default;
const { Pool } = require('pg');

const retellClient = new Retell({ apiKey: process.env.RETELL_API_KEY });
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

async function deepCompare() {
  // Get recent caller data with emails
  const callerData = await pool.query(`
    SELECT cd.caller_id, cd.field_name, cd.field_value, cd.source_call_id, c.phone_number
    FROM caller_details cd
    JOIN callers c ON c.id = cd.caller_id
    WHERE cd.field_name IN ('email', 'callback_phone')
    AND cd.field_value IS NOT NULL
    AND cd.source_call_id IS NOT NULL
    ORDER BY cd.recorded_at DESC
    LIMIT 15
  `);

  console.log('Comparing stored data vs actual transcripts:\n');

  for (const row of callerData.rows) {
    if (!row.source_call_id) continue;

    console.log('='.repeat(100));
    console.log(`STORED: ${row.field_name} = "${row.field_value}"`);
    console.log(`Source call: ${row.source_call_id}`);

    try {
      const call = await retellClient.call.retrieve(row.source_call_id);

      if (!call.transcript_object) {
        console.log('  (No transcript available)');
        continue;
      }

      // Find the relevant exchange in transcript
      console.log('\n--- ACTUAL TRANSCRIPT EXCHANGE ---');

      const searchTerm = row.field_name === 'email' ? 'email' : 'phone';
      let foundExchange = false;

      for (let i = 0; i < call.transcript_object.length; i++) {
        const msg = call.transcript_object[i];
        const content = msg.content.toLowerCase();

        if (content.includes(searchTerm) ||
            (searchTerm === 'phone' && content.includes('reach you')) ||
            (searchTerm === 'email' && (content.includes('@') || content.includes('at ')))) {
          foundExchange = true;
          // Print this message and next 5
          for (let j = i; j < Math.min(i + 6, call.transcript_object.length); j++) {
            const m = call.transcript_object[j];
            console.log(`[${m.role.toUpperCase()}]: ${m.content}`);
          }
          console.log('');
          break;
        }
      }

      if (!foundExchange) {
        console.log('  (No relevant exchange found in transcript)');
      }

      // VERDICT
      const fullText = call.transcript_object.map(m => m.content.toLowerCase()).join(' ');
      const storedValue = row.field_value.toLowerCase();

      // Check if the stored value appears verbatim in transcript
      const appearsInTranscript = fullText.includes(storedValue) ||
        fullText.includes(storedValue.replace(/-/g, ' ')) ||
        fullText.includes(storedValue.replace(/@/g, ' at ').replace(/\./g, ' dot '));

      if (appearsInTranscript) {
        console.log('✅ VERDICT: Value appears in transcript');
      } else {
        console.log('❌ VERDICT: VALUE NOT FOUND IN TRANSCRIPT - LIKELY HALLUCINATED');

        // Try to find what was actually said
        if (row.field_name === 'email') {
          // Look for agent's email readback
          for (const msg of call.transcript_object) {
            if (msg.role === 'agent' && msg.content.toLowerCase().includes('email')) {
              if (msg.content.includes('-') || msg.content.includes('at') || msg.content.includes('@')) {
                console.log('\nAgent actually said:', msg.content.substring(0, 200));
              }
            }
          }
        }
      }

    } catch (err) {
      console.log('  Error fetching call:', err.message);
    }

    console.log('\n');
  }

  pool.end();
}

deepCompare().catch(console.error);

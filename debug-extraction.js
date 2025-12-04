// Debug script to test AI extraction and see what data comes out
require('dotenv').config();
const Retell = require('retell-sdk').default;
const { extractAllCallData } = require('./lib/extractAllCallData');

const retellClient = new Retell({ apiKey: process.env.RETELL_API_KEY });

async function testExtraction() {
  const calls = await retellClient.call.list({ limit: 5 });

  for (const call of calls) {
    if (!call.transcript_object || call.transcript_object.length === 0) continue;

    console.log('\n========== CALL:', call.call_id.substring(0,25), '==========');
    console.log('From number:', call.from_number);
    console.log('Transcript messages:', call.transcript_object.length);

    // Show first few transcript lines to understand context
    console.log('\n--- FIRST 5 TRANSCRIPT LINES ---');
    for (let i = 0; i < Math.min(5, call.transcript_object.length); i++) {
      const msg = call.transcript_object[i];
      console.log(`  [${msg.role}]: ${msg.content.substring(0, 80)}...`);
    }

    // Run extraction
    console.log('\n--- RUNNING AI EXTRACTION ---');
    const extracted = await extractAllCallData(call.transcript_object, 'Test');

    console.log('\n--- EXTRACTED DATA (what goes in notification) ---');
    console.log('name:', extracted?.name);
    console.log('phone:', extracted?.phone);
    console.log('email:', extracted?.email);
    console.log('claim_number:', extracted?.claim_number);
    console.log('purpose:', extracted?.purpose?.substring(0, 100));
    console.log('call_summary:', extracted?.call_summary?.substring(0, 150));

    // Check if phone looks like a random number
    if (extracted?.phone) {
      const phoneDigits = extracted.phone.replace(/\D/g, '');
      if (phoneDigits.length !== 10 && phoneDigits.length !== 11) {
        console.log('\n⚠️ SUSPICIOUS PHONE FORMAT:', extracted.phone);
      }
    }

    // Check if email looks suspicious
    if (extracted?.email && !extracted.email.includes('@')) {
      console.log('\n⚠️ SUSPICIOUS EMAIL (no @):', extracted.email);
    }

    console.log('\n' + '='.repeat(60));
  }
}

testExtraction().catch(console.error);

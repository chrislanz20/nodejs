// Debug script - properly check extraction accuracy
require('dotenv').config();
const Retell = require('retell-sdk').default;
const { extractAllCallData } = require('./lib/extractAllCallData');

const retellClient = new Retell({ apiKey: process.env.RETELL_API_KEY });

async function checkExtraction() {
  const calls = await retellClient.call.list({ limit: 10 });

  for (const call of calls) {
    if (!call.transcript_object || call.transcript_object.length < 5) continue;

    console.log('\n' + '='.repeat(80));
    console.log('CALL:', call.call_id.substring(0, 25));
    console.log('Inbound from:', call.from_number);

    // Run extraction
    const extracted = await extractAllCallData(call.transcript_object, 'Test');

    console.log('\nEXTRACTED:');
    console.log('  phone:', extracted?.phone || 'null');
    console.log('  email:', extracted?.email || 'null');

    // Find phone-related parts of transcript
    console.log('\n--- PHONE EXCHANGE ---');
    let foundPhoneExchange = false;
    for (let i = 0; i < call.transcript_object.length; i++) {
      const msg = call.transcript_object[i];
      const c = msg.content.toLowerCase();
      if (c.includes('phone number') || c.includes('reach you')) {
        foundPhoneExchange = true;
        // Print this and next few messages
        for (let j = i; j < Math.min(i + 6, call.transcript_object.length); j++) {
          const m = call.transcript_object[j];
          console.log(`  [${m.role}]: ${m.content.substring(0, 100)}`);
        }
        break;
      }
    }
    if (!foundPhoneExchange) {
      console.log('  (no phone number exchange found)');
    }

    // Find email-related parts of transcript
    console.log('\n--- EMAIL EXCHANGE ---');
    let foundEmailExchange = false;
    for (let i = 0; i < call.transcript_object.length; i++) {
      const msg = call.transcript_object[i];
      const c = msg.content.toLowerCase();
      if (c.includes('email address') || c.includes('spell it out')) {
        foundEmailExchange = true;
        // Print this and next few messages
        for (let j = i; j < Math.min(i + 6, call.transcript_object.length); j++) {
          const m = call.transcript_object[j];
          console.log(`  [${m.role}]: ${m.content.substring(0, 120)}`);
        }
        break;
      }
    }
    if (!foundEmailExchange) {
      console.log('  (no email exchange found)');
    }

    // Manual check - does extracted phone match what was said?
    if (extracted?.phone) {
      const phoneDigits = extracted.phone.replace(/\D/g, '').substring(0, 10);
      const inboundDigits = call.from_number?.replace(/\D/g, '').slice(-10);

      if (phoneDigits === inboundDigits) {
        console.log('\n✅ Phone matches inbound number (caller gave same number as caller ID)');
      } else {
        console.log('\n⚠️  Phone differs from inbound - verify this is a CONFIRMED callback number');
      }
    }
  }
}

checkExtraction().catch(console.error);

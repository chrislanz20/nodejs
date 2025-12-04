// Debug script to check ALL recent calls for phone extraction issues
require('dotenv').config();
const Retell = require('retell-sdk').default;
const { extractAllCallData } = require('./lib/extractAllCallData');

const retellClient = new Retell({ apiKey: process.env.RETELL_API_KEY });

async function checkPhoneIssues() {
  const calls = await retellClient.call.list({ limit: 20 });

  let issues = [];

  for (const call of calls) {
    if (!call.transcript_object || call.transcript_object.length < 5) continue;

    // Run extraction
    const extracted = await extractAllCallData(call.transcript_object, 'Test');

    // Get the full transcript text
    const fullText = call.transcript_object.map(m => m.content).join(' ');

    // Check if extracted phone appears in transcript
    if (extracted?.phone) {
      const phoneDigits = extracted.phone.replace(/\D/g, '');

      // Check if this phone number actually appears in the transcript
      const phoneInTranscript = fullText.includes(phoneDigits) ||
        fullText.includes(extracted.phone) ||
        // Check for spaced out digits too
        fullText.toLowerCase().includes(phoneDigits.split('').join(' '));

      // Also check if it's the inbound caller ID
      const inboundDigits = call.from_number?.replace(/\D/g, '');
      const isInboundNumber = phoneDigits === inboundDigits || phoneDigits === inboundDigits?.slice(1);

      if (!phoneInTranscript || isInboundNumber) {
        console.log('\n⚠️ POTENTIAL ISSUE FOUND');
        console.log('Call ID:', call.call_id);
        console.log('From:', call.from_number);
        console.log('Extracted phone:', extracted.phone);
        console.log('Is inbound number?', isInboundNumber);
        console.log('Found in transcript?', phoneInTranscript);

        // Show phone-related parts of transcript
        console.log('\n--- Phone-related transcript sections ---');
        for (const msg of call.transcript_object) {
          const c = msg.content.toLowerCase();
          if (c.includes('phone') || c.includes('number') || c.includes('reach') ||
              /\d{3}/.test(msg.content) || /\b(one|two|three|four|five|six|seven|eight|nine|zero)\b/.test(c)) {
            console.log(`[${msg.role}]: ${msg.content.substring(0, 150)}`);
          }
        }

        issues.push({
          callId: call.call_id,
          fromNumber: call.from_number,
          extractedPhone: extracted.phone,
          isInboundNumber,
          phoneInTranscript
        });
      }
    }

    // Same check for email
    if (extracted?.email) {
      const emailInTranscript = fullText.toLowerCase().includes(extracted.email.toLowerCase()) ||
        fullText.toLowerCase().includes(extracted.email.split('@')[0].toLowerCase());

      if (!emailInTranscript) {
        console.log('\n⚠️ EMAIL ISSUE FOUND');
        console.log('Call ID:', call.call_id);
        console.log('Extracted email:', extracted.email);
        console.log('Found in transcript?', emailInTranscript);

        // Show email-related parts of transcript
        console.log('\n--- Email-related transcript sections ---');
        for (const msg of call.transcript_object) {
          const c = msg.content.toLowerCase();
          if (c.includes('email') || c.includes('@') || c.includes('dot com') || c.includes('at ')) {
            console.log(`[${msg.role}]: ${msg.content.substring(0, 150)}`);
          }
        }
      }
    }
  }

  console.log('\n\n========== SUMMARY ==========');
  console.log('Total issues found:', issues.length);
  for (const issue of issues) {
    console.log(`- ${issue.callId.substring(0,20)}: extracted "${issue.extractedPhone}" (inbound: ${issue.isInboundNumber})`);
  }
}

checkPhoneIssues().catch(console.error);

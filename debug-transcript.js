// Debug script to see FULL transcripts and verify what numbers were actually said
require('dotenv').config();
const Retell = require('retell-sdk').default;

const retellClient = new Retell({ apiKey: process.env.RETELL_API_KEY });

async function showTranscripts() {
  const calls = await retellClient.call.list({ limit: 5 });

  for (const call of calls) {
    if (!call.transcript_object || call.transcript_object.length < 10) continue;

    console.log('\n' + '='.repeat(80));
    console.log('CALL:', call.call_id);
    console.log('From:', call.from_number);
    console.log('='.repeat(80));

    // Print FULL transcript
    for (const msg of call.transcript_object) {
      console.log(`\n[${msg.role.toUpperCase()}]: ${msg.content}`);
    }

    // Look for phone number mentions
    console.log('\n--- SEARCHING FOR PHONE NUMBERS IN TRANSCRIPT ---');
    const fullText = call.transcript_object.map(m => m.content).join(' ');

    // Look for digit patterns (spoken or digits)
    const phonePatterns = [
      /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g,  // 123-456-7890
      /\b\(\d{3}\)\s*\d{3}[-.\s]?\d{4}\b/g,  // (123) 456-7890
      /\b\d{10}\b/g,  // 1234567890
    ];

    for (const pattern of phonePatterns) {
      const matches = fullText.match(pattern);
      if (matches) {
        console.log('Found phone patterns:', matches);
      }
    }

    // Look for email patterns
    const emailPattern = /[\w.-]+@[\w.-]+\.\w+/gi;
    const emailMatches = fullText.match(emailPattern);
    if (emailMatches) {
      console.log('Found email patterns:', emailMatches);
    }

    console.log('\n' + '='.repeat(80));

    // Only show first 2 calls to avoid too much output
    break;
  }
}

showTranscripts().catch(console.error);

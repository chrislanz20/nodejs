// Debug to find where 3214600001 is coming from
require('dotenv').config();
const Retell = require('retell-sdk').default;
const retellClient = new Retell({ apiKey: process.env.RETELL_API_KEY });

async function debug() {
  const call = await retellClient.call.retrieve('call_1cb6123a3e1071e99a20ce75bfe');

  console.log('FULL TRANSCRIPT for call_1cb6123a3e1071e99a20ce75bfe:\n');

  for (let i = 0; i < call.transcript_object.length; i++) {
    const msg = call.transcript_object[i];
    console.log(`[${i}] ${msg.role.toUpperCase()}: ${msg.content}`);
  }

  // Search for any number patterns
  console.log('\n\nSearching for number patterns...');
  const text = call.transcript_object.map(m => m.content).join(' ');

  // Look for "3214600001" or spoken version
  if (text.includes('321') || text.includes('three two one')) {
    console.log('Found 321 pattern in transcript');
  }

  // Look for any number readback patterns
  const readbacks = text.match(/\d\s+\d\s+\d\s+\d/g);
  if (readbacks) {
    console.log('Number readbacks found:', readbacks);
  }
}

debug().catch(console.error);

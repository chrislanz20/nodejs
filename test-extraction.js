// Test data extraction on one of today's calls
require('dotenv').config();
const Retell = require('retell-sdk').default;
const { extractAllCallData } = require('./lib/extractAllCallData');

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });

async function test() {
  // Get one of today's insurance calls
  const callId = 'call_e6ad8d212dddeb9addf6f285287';

  console.log('Testing extraction on call: ' + callId);
  console.log('-'.repeat(80));

  try {
    const call = await retell.call.retrieve(callId);
    const transcript = call.transcript_object || call.transcript;

    if (!transcript) {
      console.log('No transcript available');
      return;
    }

    console.log('Transcript length: ' + (Array.isArray(transcript) ? transcript.length + ' turns' : 'text'));

    // Show first few lines of transcript
    if (Array.isArray(transcript)) {
      console.log('\nFirst 5 turns:');
      transcript.slice(0, 5).forEach((t, i) => {
        console.log(`${i+1}. ${t.role}: ${t.content?.substring(0, 100)}...`);
      });
    }

    console.log('\nExtracting data...');
    const data = await extractAllCallData(transcript, 'Insurance');

    console.log('\nExtracted data:');
    console.log(JSON.stringify(data, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  }
}
test();

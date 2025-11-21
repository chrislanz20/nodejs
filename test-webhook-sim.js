const Retell = require('retell-sdk').default;
const client = new Retell({ apiKey: 'key_adeebba4f1f28fe45fce4a999ea2' });

async function simulateWebhook() {
  const callId = 'call_674bd16e51098ddb3440b36bcaf';  // Your test call

  console.log('Simulating exactly what the webhook does...');
  console.log('');

  const fullCall = await client.call.retrieve(callId);

  console.log('=== What Retell returns ===');
  console.log('transcript_object:', typeof fullCall.transcript_object, fullCall.transcript_object ? fullCall.transcript_object.length + ' items' : 'NULL/UNDEFINED');
  console.log('transcript:', typeof fullCall.transcript, fullCall.transcript ? 'exists (' + fullCall.transcript.length + ' chars)' : 'NULL/UNDEFINED');
  console.log('call_analysis:', typeof fullCall.call_analysis, fullCall.call_analysis ? 'exists' : 'NULL/UNDEFINED');
  console.log('call_analysis.call_summary:', fullCall.call_analysis?.call_summary ? 'exists' : 'NULL/UNDEFINED');

  // This is exactly what the webhook does
  let transcript = fullCall.transcript_object || fullCall.transcript || [];

  console.log('');
  console.log('=== What webhook code sees ===');
  console.log('transcript variable type:', typeof transcript);
  console.log('transcript.length:', transcript.length);
  console.log('Is array?', Array.isArray(transcript));

  // This is the check that leads to 'No transcript available'
  if (!transcript || transcript.length === 0) {
    console.log('');
    console.log('❌ WOULD RETURN: No transcript available');
  } else {
    console.log('');
    console.log('✅ WOULD PROCEED with categorization');
    if (Array.isArray(transcript)) {
      console.log('First message:', transcript[0]?.role + ': ' + transcript[0]?.content?.substring(0, 50));
    }
  }

  // Show all keys on fullCall to understand structure
  console.log('');
  console.log('=== All keys on fullCall object ===');
  console.log(Object.keys(fullCall));
}

simulateWebhook().catch(e => console.error('Error:', e));

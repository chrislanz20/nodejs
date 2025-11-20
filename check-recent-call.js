const axios = require('axios');

async function checkRecentCall() {
  const response = await axios.get('http://localhost:3000/api/agent-summary');
  const calls = response.data.all_calls;

  // Sort by start_timestamp descending (most recent first)
  const sortedCalls = calls.sort((a, b) => b.start_timestamp - a.start_timestamp);

  // Get the most recent call
  const recentCall = sortedCalls[0];

  console.log('📞 MOST RECENT CALL:');
  console.log('Call ID:', recentCall.call_id);
  console.log('Phone:', recentCall.from_number);
  console.log('Date:', new Date(recentCall.start_timestamp).toLocaleString());
  console.log('Duration:', recentCall.duration_minutes, 'minutes');
  console.log('Category:', recentCall.category || 'NONE');
  console.log('Reasoning:', recentCall.reasoning || 'NONE');
  console.log('Auto:', recentCall.auto);
  console.log('Manual:', recentCall.manual);
  console.log('Has end_timestamp:', !!recentCall.end_timestamp);

  // Now fetch the full call details with transcript
  const fullCallResponse = await axios.get(`http://localhost:3000/api/call-details/${recentCall.call_id}`);
  const fullCall = fullCallResponse.data;

  console.log('\n📝 TRANSCRIPT STATUS:');
  console.log('Has transcript:', !!fullCall.transcript);
  console.log('Has transcript_object:', !!fullCall.transcript_object);

  if (fullCall.transcript_object && fullCall.transcript_object.length > 0) {
    console.log('\n💬 FIRST 5 TRANSCRIPT MESSAGES:');
    fullCall.transcript_object.slice(0, 5).forEach((msg, i) => {
      console.log(`  ${i+1}. ${msg.role}: ${msg.content.substring(0, 100)}...`);
    });
  }
}

checkRecentCall().catch(console.error);

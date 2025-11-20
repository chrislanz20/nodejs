const axios = require('axios');

async function diagnoseDurations() {
  try {
    const response = await axios.get('http://localhost:3000/api/agent-summary');
    const calls = response.data.all_calls;

    console.log('\n📊 CHECKING DURATION CALCULATIONS\n');
    console.log('=' .repeat(80));

    // Get calls marked as "Other"
    const otherCalls = calls.filter(c => {
      // Check if it's in categories
      return c.category === 'Other';
    });

    console.log(`Found ${otherCalls.length} calls marked as "Other"\n`);

    // Check the first 10
    const samplesToCheck = otherCalls.slice(0, 10);

    for (const call of samplesToCheck) {
      // Calculate duration from timestamps
      let actualDuration = 0;
      if (call.end_timestamp && call.start_timestamp) {
        actualDuration = Math.round((call.end_timestamp - call.start_timestamp) / 1000 / 60 * 100) / 100;
      }

      console.log('\n' + '-'.repeat(80));
      console.log(`Call ID: ${call.call_id.substring(0, 30)}...`);
      console.log(`Category: ${call.category}`);
      console.log(`Reasoning: ${call.reasoning}`);
      console.log(`Phone: ${call.from_number || call.to_number || 'N/A'}`);
      console.log(`\nTimestamps:`);
      console.log(`  Start: ${call.start_timestamp} (${new Date(call.start_timestamp).toLocaleString()})`);
      console.log(`  End: ${call.end_timestamp} (${call.end_timestamp ? new Date(call.end_timestamp).toLocaleString() : 'N/A'})`);
      console.log(`\nDuration:`);
      console.log(`  API duration_minutes: ${call.duration_minutes}`);
      console.log(`  Calculated from timestamps: ${actualDuration} minutes`);
      console.log(`  Matches: ${call.duration_minutes === actualDuration ? '✓ YES' : '✗ NO'}`);

      if (call.duration_minutes < 1 && actualDuration >= 1) {
        console.log(`\n⚠️  BUG FOUND! API says ${call.duration_minutes} min but actual is ${actualDuration} min`);
      }

      if (actualDuration >= 1 && call.reasoning === 'Call duration under 1 minute') {
        console.log(`\n🚨 CRITICAL: Call is ${actualDuration} minutes but marked as "under 1 minute"!`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Diagnosis complete\n');

  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

diagnoseDurations();

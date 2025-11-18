const axios = require('axios');

async function checkDashboard() {
  try {
    const response = await axios.get('http://localhost:3000/api/agent-summary');
    const data = response.data;
    const calls = data.all_calls || [];

    console.log('📊 Dashboard Statistics:');
    console.log('Total calls loaded:', calls.length);
    console.log('Pages fetched:', data.pages_fetched);

    // Check categorization
    const categorizedCount = calls.filter(c => c.category).length;
    const uncategorizedCalls = calls.filter(c => !c.category);

    console.log('\n🏷️ Categorization:');
    console.log('Calls with categories:', categorizedCount);
    console.log('Calls WITHOUT categories (UNCATEGORIZED):', uncategorizedCalls.length);

    if (uncategorizedCalls.length > 0) {
      console.log('\n❌ Sample uncategorized calls:');
      uncategorizedCalls.slice(0, 10).forEach(c => {
        const duration = c.end_timestamp && c.start_timestamp
          ? Math.round((c.end_timestamp - c.start_timestamp) / 1000 / 60 * 100) / 100
          : 0;
        console.log('   ', c.call_id.substring(0, 25) + '...', '-', duration, 'min');
      });

      // Group by duration
      const under1Min = uncategorizedCalls.filter(c => {
        const duration = c.end_timestamp && c.start_timestamp
          ? (c.end_timestamp - c.start_timestamp) / 1000 / 60
          : 0;
        return duration < 1;
      });

      const over1Min = uncategorizedCalls.filter(c => {
        const duration = c.end_timestamp && c.start_timestamp
          ? (c.end_timestamp - c.start_timestamp) / 1000 / 60
          : 0;
        return duration >= 1;
      });

      console.log('\n📊 Uncategorized breakdown:');
      console.log('   Under 1 minute:', under1Min.length, '(should be auto-categorized as Other)');
      console.log('   1+ minutes:', over1Min.length, '(should be AI-categorized)');
    } else {
      console.log('\n✅ All calls are categorized!');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkDashboard();

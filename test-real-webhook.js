// Test the ACTUAL webhook URL that Retell is calling
const axios = require('axios');

const WEBHOOK_URL = 'https://nodejs-1bogy8x99-chris-lanzillis-projects.vercel.app/webhook/retell-call-ended';

// Simulate a real Retell webhook payload
const testPayload = {
  call: {
    call_id: 'test_call_' + Date.now(),
    agent_id: 'agent_8e50b96f7e7bb7ce7479219fcc',
    from_number: '+17814757191',
    to_number: '+12018624576',
    start_timestamp: Date.now(),
    end_timestamp: Date.now() + 60000,
    call_type: 'inbound',
    disconnect_reason: 'user_hangup'
  }
};

console.log('🧪 Testing REAL Retell webhook URL...');
console.log(`📍 URL: ${WEBHOOK_URL}`);
console.log(`📦 Payload: ${JSON.stringify(testPayload, null, 2)}`);
console.log('\n🚀 Sending test webhook...\n');

axios.post(WEBHOOK_URL, testPayload, {
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 10000
})
  .then(response => {
    console.log('✅ Webhook accepted!');
    console.log(`   Status: ${response.status}`);
    console.log(`   Response: ${JSON.stringify(response.data, null, 2)}`);
    console.log('\n⏳ Waiting 5 seconds for async processing...');

    setTimeout(() => {
      console.log('\n📧 Check your email and phone for notifications!');
      console.log('   Email: 17lanzch@gmail.com');
      console.log('   Phone: +17814757191');
      console.log('\n❓ Did you receive notifications?');
      console.log('   - If YES: The webhook is working correctly');
      console.log('   - If NO: The deployment might not have the latest code');
    }, 5000);
  })
  .catch(error => {
    console.error('❌ Webhook failed!');
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Response: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      console.error(`   Error: ${error.message}`);
    }
  });

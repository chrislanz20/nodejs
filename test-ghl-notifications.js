// Test script to verify GoHighLevel notifications are working
require('dotenv').config();

const { sendNotifications } = require('./lib/ghlNotifications');

// Test data simulating a New Lead call
const testCallData = {
  name: 'Test Lead - Chris Testing',
  phone: '+17814757191',
  phone_number: '+17814757191',
  from_number: '+17814757191',
  email: '17lanzch@gmail.com',
  incident_description: 'TEST: This is a test notification from Node.js to verify GoHighLevel integration is working correctly.',
  incident_date: '2025-11-20',
  incident_location: 'Test Location'
};

// CourtLaw agent ID
const agentId = 'agent_8e50b96f7e7bb7ce7479219fcc';
const category = 'New Lead';

console.log('🧪 Testing GoHighLevel Notification System...\n');
console.log('📋 Test Configuration:');
console.log(`   Agent: ${agentId}`);
console.log(`   Category: ${category}`);
console.log(`   Mode: TEST (will only send to Chris)`);
console.log(`   Email: 17lanzch@gmail.com`);
console.log(`   SMS: +17814757191`);
console.log(`   Data: ${JSON.stringify(testCallData, null, 2)}`);
console.log('\n🚀 Sending test notifications...\n');

sendNotifications(agentId, category, testCallData)
  .then(result => {
    console.log('\n✅ TEST COMPLETE!\n');
    console.log('📊 Results:');
    console.log(JSON.stringify(result, null, 2));

    if (result.emails_sent && result.emails_sent.length > 0) {
      console.log('\n✅ EMAILS SENT SUCCESSFULLY via GoHighLevel!');
    } else {
      console.log('\n❌ NO EMAILS SENT - Check GHL API configuration');
    }

    if (result.sms_sent && result.sms_sent.length > 0) {
      console.log('✅ SMS SENT SUCCESSFULLY via GoHighLevel!');
    } else {
      console.log('❌ NO SMS SENT - Check GHL API configuration');
    }

    if (result.errors && result.errors.length > 0) {
      console.log('\n⚠️  ERRORS:');
      result.errors.forEach(err => {
        console.log(`   - ${err.error}`);
      });
    }

    console.log('\n📧 Check your email (17lanzch@gmail.com) and phone (+17814757191) for the test notification!');
  })
  .catch(error => {
    console.error('\n❌ TEST FAILED!');
    console.error('Error:', error);
  });

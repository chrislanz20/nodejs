// Test Notifications - All 5 Email Types + SMS
// This script tests all notification types to verify everything works

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const AGENT_ID = 'agent_8e50b96f7e7bb7ce7479219fcc'; // CourtLaw

// Sample call data for each category
const testCases = [
  {
    category: 'New Lead',
    callData: {
      name: 'John Smith',
      phone: '+15551234567',
      email: 'john.smith@example.com',
      from_number: '+12018624576',
      incident_description: 'Car accident on I-95, rear-ended at red light. Neck and back pain.',
      incident_date: '2025-11-15',
      incident_location: 'I-95, Exit 10',
      case_type: 'rear_end'
    }
  },
  {
    category: 'Existing Client',
    callData: {
      first_name: 'Jane',
      last_name: 'Doe',
      phone: '+15559876543',
      email: 'jane.doe@example.com',
      from_number: '+12018624576',
      purpose: 'Checking on case status',
      claim_num: 'CL-2024-00123',
      client_name: 'Jane Doe',
      representing_who: 'Self'
    }
  },
  {
    category: 'Attorney',
    callData: {
      name: 'Robert Johnson, Esq.',
      phone: '+15554567890',
      email: 'rjohnson@lawfirm.com',
      from_number: '+12018624576',
      who_representing: 'Opposing counsel for Smith v. Jones',
      case_name: 'Smith v. Jones',
      claim_number: 'CV-2024-5678',
      purpose: 'Requesting settlement discussion'
    }
  },
  {
    category: 'Medical',
    callData: {
      name: 'Dr. Sarah Martinez',
      phone_number: '+15556789012',
      email_address: 'smartinez@hospitalgroup.com',
      from_number: '+12018624576',
      claim_num: 'MED-2024-9876',
      representing_who: 'Memorial Hospital',
      client_name: 'Patient: Michael Brown',
      purpose: 'Inquiring about settlement payment for medical lien'
    }
  },
  {
    category: 'Other',
    callData: {
      name: 'Lisa Chen',
      phone: '+15553456789',
      email: 'lisa.chen@example.com',
      from_number: '+12018624576',
      purpose: 'General inquiry about firm services',
      representing_who: 'Self',
      client_name: 'N/A',
      claim_num: 'N/A'
    }
  }
];

async function testAllNotifications() {
  console.log('\n🧪 TESTING ALL NOTIFICATION TYPES\n');
  console.log('=' .repeat(80));
  console.log(`Testing ${testCases.length} notification categories`);
  console.log(`Agent ID: ${AGENT_ID.substring(0, 30)}...`);
  console.log(`Test recipient: 17lanzch@gmail.com + +17814757191`);
  console.log('=' .repeat(80));

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    console.log(`\n\n📧 Test ${i + 1}/${testCases.length}: ${testCase.category}`);
    console.log('-'.repeat(80));

    try {
      const response = await axios.post(`${BASE_URL}/api/send-notification-test`, {
        agent_id: AGENT_ID,
        category: testCase.category,
        call_data: testCase.callData
      });

      console.log('✅ SUCCESS:', response.data.message);
      console.log('Result:', JSON.stringify(response.data.result, null, 2));

      // Wait 2 seconds between tests to avoid rate limiting
      if (i < testCases.length - 1) {
        console.log('\n⏳ Waiting 2 seconds before next test...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error('❌ FAILED:', error.response?.data || error.message);
    }
  }

  console.log('\n\n' + '='.repeat(80));
  console.log('✅ ALL TESTS COMPLETE!');
  console.log('=' .repeat(80));
  console.log('\n📬 Check your email (17lanzch@gmail.com) and SMS (+17814757191)');
  console.log('You should have received:');
  console.log('  • 5 emails (one for each category)');
  console.log('  • 1 SMS (only for New Lead)');
  console.log('\n');
}

// Run tests
testAllNotifications();

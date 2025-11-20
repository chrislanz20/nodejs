const axios = require('axios');

const GHL_API_KEY = 'pit-e0730a40-bcf9-43bc-bb39-9fc71668b7d2';
const LOCATION_ID = 'lneM3M1j3P5i0JYeNK18';
const CONTACT_ID = 'Na5Cpmfe7245uXNp3TY2';
const BASE_URL = 'https://services.leadconnectorhq.com';

const headers = {
  'Authorization': `Bearer ${GHL_API_KEY}`,
  'Content-Type': 'application/json',
  'Version': '2021-07-28'
};

async function updateContactAndSendSMS() {
  try {
    console.log('\n🔧 UPDATING CONTACT & TESTING SMS\n');
    console.log('=' .repeat(80));

    // STEP 1: Update contact with phone number
    console.log('\n📝 STEP 1: Updating contact with phone number...');

    try {
      const updateResponse = await axios.put(
        `${BASE_URL}/contacts/${CONTACT_ID}`,
        {
          phone: '+17814757191'
        },
        { headers }
      );

      console.log('✅ Contact updated successfully!');
      console.log('Phone set to:', '+17814757191');
    } catch (updateError) {
      console.log('❌ Contact update failed:');
      console.log('Status:', updateError.response?.status);
      console.log('Error:', JSON.stringify(updateError.response?.data, null, 2));
      // Continue anyway - phone might already be set
    }

    // STEP 2: Send SMS
    console.log('\n' + '-'.repeat(80));
    console.log('\n📱 STEP 2: Sending SMS...');

    try {
      const smsResponse = await axios.post(
        `${BASE_URL}/conversations/messages`,
        {
          type: 'SMS',
          locationId: LOCATION_ID,
          contactId: CONTACT_ID,
          message: `🚨 TEST: New Inbound Lead

Name: Chris Lanzilli (TEST)
Phone: 781-475-7191
Email: 17lanzch@gmail.com
Summary: Testing GoHighLevel API for CourtLaw N8N migration. This confirms SMS works!`
        },
        { headers }
      );

      console.log('✅ SMS SENT SUCCESSFULLY!');
      console.log('Response:', JSON.stringify(smsResponse.data, null, 2));
    } catch (smsError) {
      console.log('❌ SMS sending failed:');
      console.log('Status:', smsError.response?.status);
      console.log('Error:', JSON.stringify(smsError.response?.data, null, 2));
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n✅ TEST COMPLETE\n');

  } catch (error) {
    console.log('\n❌ UNEXPECTED ERROR:');
    console.log(error.message);
    if (error.response) {
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

updateContactAndSendSMS();

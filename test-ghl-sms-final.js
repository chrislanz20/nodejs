const axios = require('axios');

const GHL_API_KEY = 'pit-e0730a40-bcf9-43bc-bb39-9fc71668b7d2';
const LOCATION_ID = 'lneM3M1j3P5i0JYeNK18';
const CONTACT_ID = 'msF0VOnxJ584ga7knXF2'; // Contact that has phone number
const BASE_URL = 'https://services.leadconnectorhq.com';

const headers = {
  'Authorization': `Bearer ${GHL_API_KEY}`,
  'Content-Type': 'application/json',
  'Version': '2021-07-28'
};

async function testSMSWithValidContact() {
  try {
    console.log('\n📱 FINAL SMS TEST\n');
    console.log('=' .repeat(80));
    console.log('Contact ID:', CONTACT_ID);
    console.log('Phone:', '+17814757191');

    // Send SMS
    const smsResponse = await axios.post(
      `${BASE_URL}/conversations/messages`,
      {
        type: 'SMS',
        locationId: LOCATION_ID,
        contactId: CONTACT_ID,
        message: `🎉 SUCCESS! New Inbound Lead

Name: Chris Lanzilli (TEST)
Phone: 781-475-7191
Email: 17lanzch@gmail.com
Summary: Testing GoHighLevel API for CourtLaw. This confirms BOTH email AND SMS work via the GHL API!`
      },
      { headers }
    );

    console.log('\n✅ SMS SENT SUCCESSFULLY!');
    console.log('Response:', JSON.stringify(smsResponse.data, null, 2));
    console.log('\n' + '='.repeat(80));
    console.log('\n🎯 CONCLUSION: GoHighLevel API works for BOTH Email AND SMS!');
    console.log('Architecture confirmed: Node.js → GHL API (email + SMS)');
    console.log('\n');

  } catch (error) {
    console.log('\n❌ ERROR:');
    console.log('Status:', error.response?.status);
    console.log('Error:', JSON.stringify(error.response?.data, null, 2));
  }
}

testSMSWithValidContact();
